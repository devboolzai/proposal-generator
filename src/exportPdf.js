import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { saveAs } from "file-saver";
import { BRAND } from "./styles/appStyles";

// ============================================================
// PDF EXPORT
//
// Rasterises the on-screen preview (#proposal-preview) and lays it
// out over A4 pages, behind the same branded cover page the Word
// export uses.
//
// Why a raster and not real text: jsPDF has no bidi engine, so
// Hebrew has to be reordered by hand and still breaks on mixed
// Hebrew/Latin lines. The browser already solved that when it
// painted the preview, so capturing the DOM is what guarantees the
// PDF matches what the user approved on screen.
//
// Layout rules, matching the printed Boolzai proposals:
//   • page 1 is the branded cover, full bleed
//   • body pages break between blocks, never through a line
//   • everything inside #proposal-tail (notes + appendix) is forced
//     onto one page of its own, shrunk to fit if necessary
//   • every page but the cover carries the copyright footer
// ============================================================

const PREVIEW_ID = "proposal-preview";
const TAIL_ID = "proposal-tail";

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const MARGIN_TOP_MM = 12;
const MARGIN_BOTTOM_MM = 18; // deeper: the footer lives here

const CAPTURE_SCALE = 2; // 2x for crisp text on retina / when zoomed
const JPEG_QUALITY = 0.95;

const FOOTER_LINE_1 = `© All Rights Reserved Boolzai ${new Date().getFullYear()}`;
const FOOTER_LINE_2 = "www.boolzai.co.il";

// Tags that are always treated as one indivisible unit, even though they do
// contain block-level children.
const ALWAYS_ATOMIC = new Set(["TR", "LI"]);

// Display values that mean "this child is its own block, so the parent is a
// container rather than a leaf we must keep whole".
const BLOCK_DISPLAYS = new Set([
  "block",
  "flex",
  "grid",
  "table",
  "table-row",
  "table-row-group",
  "list-item",
]);

let _coverDataUrl = null;
async function getCoverImage() {
  if (_coverDataUrl) return _coverDataUrl;
  const resp = await fetch("/cover-image.jpg");
  const blob = await resp.blob();
  _coverDataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  return _coverDataUrl;
}

function buildFileName(proposalData, proposalId) {
  // The number leads, so a folder of proposals sorts and searches by it.
  const who = proposalData.companyName
    ? proposalData.companyName.replace(/\s+/g, "_")
    : proposalData.date.replace(/\//g, "-");
  return `הצעת_מחיר_${proposalId}_${who}.pdf`;
}

function hexToRgb(hex) {
  const v = hex.replace("#", "");
  return [
    parseInt(v.slice(0, 2), 16),
    parseInt(v.slice(2, 4), 16),
    parseInt(v.slice(4, 6), 16),
  ];
}

/**
 * Collect the y-extent (in CSS px, relative to the preview root) of every
 * element that renders as one visual unit — a line of text, a bullet, a table
 * row. A page break may sit between two of these but never inside one.
 *
 * This walks the tree rather than using a tag selector: the preview is built
 * almost entirely from <div>, so matching on li/p/tr would miss nearly
 * everything on the page.
 */
function findAtomicBlocks(root) {
  const rootTop = root.getBoundingClientRect().top;
  const blocks = [];

  const visit = (el) => {
    for (const child of el.children) {
      const rect = child.getBoundingClientRect();
      if (rect.height === 0) continue; // hidden or collapsed

      const isLeaf =
        ALWAYS_ATOMIC.has(child.tagName) ||
        child.children.length === 0 ||
        !Array.from(child.children).some((gc) =>
          BLOCK_DISPLAYS.has(getComputedStyle(gc).display)
        );

      if (isLeaf) {
        blocks.push({ top: rect.top - rootTop, bottom: rect.bottom - rootTop });
      } else {
        visit(child);
      }
    }
  };

  visit(root);
  return blocks.sort((a, b) => a.top - b.top);
}

/**
 * Move a page break up so it lands between blocks instead of through one.
 *
 * The only case that still cuts is a single block taller than a whole page —
 * it started before this page began, so no break position can keep it whole.
 */
function snapToSafeBreak(desired, blocks, pageStart) {
  const straddling = blocks.filter(
    (b) => b.top < desired - 0.5 && b.bottom > desired + 0.5
  );
  if (straddling.length === 0) return desired;

  const highestTop = Math.min(...straddling.map((b) => b.top));

  // Taller than one page — cutting is unavoidable.
  if (highestTop <= pageStart + 1) return desired;

  return highestTop;
}

/** Copy a horizontal band out of the full capture into its own canvas. */
function sliceCanvas(source, fromPx, heightPx, cssWidth) {
  const out = document.createElement("canvas");
  out.width = Math.round(cssWidth * CAPTURE_SCALE);
  out.height = Math.round(heightPx * CAPTURE_SCALE);

  const ctx = out.getContext("2d");
  ctx.fillStyle = BRAND.paper;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(
    source,
    0,
    Math.round(fromPx * CAPTURE_SCALE),
    out.width,
    out.height,
    0,
    0,
    out.width,
    out.height
  );

  return out.toDataURL("image/jpeg", JPEG_QUALITY);
}

function drawFooters(pdf) {
  const [r, g, b] = hexToRgb(BRAND.purpleSoft);
  const total = pdf.getNumberOfPages();

  // Start at 2: the cover carries its own artwork.
  for (let page = 2; page <= total; page++) {
    pdf.setPage(page);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(r, g, b);
    pdf.text(FOOTER_LINE_1, A4_WIDTH_MM / 2, A4_HEIGHT_MM - 11, {
      align: "center",
    });
    pdf.text(FOOTER_LINE_2, A4_WIDTH_MM / 2, A4_HEIGHT_MM - 7, {
      align: "center",
    });
  }
}

/**
 * Build the proposal PDF from the rendered preview.
 *
 * The number itself is not drawn here: it is already painted into
 * #proposal-preview, so the capture picks it up like the rest of the page.
 * It is only needed for the file name.
 *
 * @param {object} proposalData      state slice, used for the file name
 * @param {number} proposalId        the allocated proposal number
 * @param {object} [options]
 * @param {boolean} [options.returnBlob]  resolve with the blob instead of
 *        downloading it — this is the hook the future "email the proposal"
 *        dialog will use to get bytes it can attach.
 * @returns {Promise<{blob: Blob, fileName: string}|void>}
 */
export async function generatePdf(proposalData, proposalId, { returnBlob = false } = {}) {
  if (!Number.isInteger(proposalId)) {
    throw new Error("לא הוקצה מספר להצעה — יש לרענן את מסך התצוגה המקדימה.");
  }

  const element = document.getElementById(PREVIEW_ID);
  if (!element) {
    throw new Error(
      `לא נמצא אלמנט #${PREVIEW_ID} — יש לייצא PDF ממסך התצוגה המקדימה.`
    );
  }

  // Fb Gandalf is a self-hosted @font-face; capturing before it resolves
  // silently falls back to a system font and the PDF looks wrong.
  if (document.fonts?.ready) await document.fonts.ready;

  const rootTop = element.getBoundingClientRect().top;
  const tailEl = document.getElementById(TAIL_ID);
  const cssHeight = element.offsetHeight;
  const cssWidth = element.offsetWidth;

  // Where the notes begin. Everything below this gets its own page.
  const tailTop = tailEl
    ? Math.max(0, tailEl.getBoundingClientRect().top - rootTop)
    : cssHeight;
  const hasTail = tailEl && tailTop > 0 && tailTop < cssHeight - 1;

  const blocks = findAtomicBlocks(element);

  const canvas = await html2canvas(element, {
    scale: CAPTURE_SCALE,
    backgroundColor: BRAND.paper,
    useCORS: true,
    logging: false,
    // The preview is taller than the viewport; without these the capture
    // stops at the fold.
    windowWidth: element.scrollWidth,
    windowHeight: element.scrollHeight,
  });

  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

  // ── Page 1: branded cover, full bleed ──
  pdf.addImage(await getCoverImage(), "JPEG", 0, 0, A4_WIDTH_MM, A4_HEIGHT_MM);

  const usableHeightMm = A4_HEIGHT_MM - MARGIN_TOP_MM - MARGIN_BOTTOM_MM;
  const pxPerMm = cssWidth / A4_WIDTH_MM;
  const pageHeightPx = usableHeightMm * pxPerMm;

  // ── Body pages: everything above the tail ──
  const bodyEndPx = hasTail ? tailTop : cssHeight;
  let cursorPx = 0;
  let guard = 0;

  while (cursorPx < bodyEndPx && guard++ < 200) {
    const desired = Math.min(cursorPx + pageHeightPx, bodyEndPx);
    const breakPx =
      desired >= bodyEndPx
        ? bodyEndPx
        : snapToSafeBreak(desired, blocks, cursorPx);

    const heightPx = breakPx - cursorPx;
    if (heightPx <= 0) break;

    pdf.addPage();
    pdf.addImage(
      sliceCanvas(canvas, cursorPx, heightPx, cssWidth),
      "JPEG",
      0,
      MARGIN_TOP_MM,
      A4_WIDTH_MM,
      heightPx / pxPerMm
    );

    cursorPx = breakPx;
  }

  // ── Tail page: notes + appendix, always exactly one page ──
  if (hasTail) {
    const tailHeightPx = cssHeight - tailTop;
    const tailHeightMm = tailHeightPx / pxPerMm;

    // Shrink to fit rather than spilling onto a second page.
    const fit = Math.min(1, usableHeightMm / tailHeightMm);
    const drawWidthMm = A4_WIDTH_MM * fit;
    const drawHeightMm = tailHeightMm * fit;

    pdf.addPage();
    pdf.addImage(
      sliceCanvas(canvas, tailTop, tailHeightPx, cssWidth),
      "JPEG",
      (A4_WIDTH_MM - drawWidthMm) / 2,
      MARGIN_TOP_MM,
      drawWidthMm,
      drawHeightMm
    );
  }

  drawFooters(pdf);

  const fileName = buildFileName(proposalData, proposalId);
  const blob = pdf.output("blob");

  if (returnBlob) return { blob, fileName };
  saveAs(blob, fileName);
}
