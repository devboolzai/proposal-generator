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
//
// Every measurement below is taken inside html2canvas's onclone
// callback, never from the live DOM. html2canvas rasterises a
// clone laid out in its own iframe, and that layout is not the one
// on screen — measuring here and slicing there is what used to put
// the total on the notes page and squash the body pages.
// ============================================================

const PREVIEW_ID = "proposal-preview";
const TAIL_ID = "proposal-tail";

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const MARGIN_TOP_MM = 12;
const MARGIN_BOTTOM_MM = 18; // deeper: the footer lives here

const CAPTURE_SCALE = 2; // 2x for crisp text on retina / when zoomed
const JPEG_QUALITY = 0.95;

// html2canvas re-lays-out a clone of the page inside an iframe of this size, and
// it is that layout — not the one on screen — that gets rasterised. Fixing the
// value means the same proposal exports identically from any machine, instead of
// wrapping its lines differently depending on the operator's window width.
//
// Comfortably above the 864px at which styles.preview's maxWidth stops binding,
// so the preview lands on exactly PREVIEW_WIDTH_PX without this file having to
// know about the padding on styles.content.
const CAPTURE_VIEWPORT_WIDTH = 1280;
const CAPTURE_VIEWPORT_HEIGHT = 1024;
const PREVIEW_WIDTH_PX = 800; // keep in step with styles.preview.maxWidth

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
  // These elements live in the html2canvas clone's iframe, not in this window,
  // so styles have to be resolved through their own view. Hoisted because it is
  // read once per grandchild of the whole preview.
  const view = root.ownerDocument?.defaultView ?? window;
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
          BLOCK_DISPLAYS.has(view.getComputedStyle(gc).display)
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
 * Every coordinate the page splitter needs, in CSS px relative to the top of
 * `root`.
 *
 * Only ever called on the clone html2canvas is about to rasterise, never on the
 * live node. html2canvas re-lays-out the whole document inside an iframe, and
 * the preview's width in there is not its width out here — which changes where
 * lines wrap, and so shifts every y coordinate below the first re-wrapped line
 * by an amount no single factor can undo. Measuring the clone makes measurement
 * space and raster space the same space by construction.
 */
function measurePreview(root) {
  const rect = root.getBoundingClientRect();
  const tailEl = root.querySelector(`#${TAIL_ID}`);

  const tailTop = tailEl
    ? Math.max(0, tailEl.getBoundingClientRect().top - rect.top)
    : rect.height;

  return {
    // Fractional rather than offsetWidth/offsetHeight: html2canvas sizes the
    // canvas from getBoundingClientRect too, so rounded values would disagree
    // with it by up to a pixel.
    cssWidth: rect.width,
    cssHeight: rect.height,
    tailTop,
    // A tail flush with the bottom is an empty one — no notes and no appendix
    // leave a zero-height div — and it earns no page of its own.
    hasTail: !!tailEl && tailTop > 0 && tailTop < rect.height - 1,
    blocks: findAtomicBlocks(root),
  };
}

/**
 * Used only if onclone never produced a measurement. Deriving the geometry from
 * the canvas cannot distort or clip anything; it just gives up the two niceties,
 * breaking between blocks and the dedicated tail page.
 *
 * Deliberately does not fall back to measuring the live element — that is the
 * bug this whole file works around, and doing it silently would be worse than
 * losing the tail page.
 */
function fallbackMeasurement(canvas) {
  console.warn(
    "[exportPdf] no clone measurement; falling back to fixed-height slicing"
  );
  const cssHeight = canvas.height / CAPTURE_SCALE;
  return {
    cssWidth: canvas.width / CAPTURE_SCALE,
    cssHeight,
    tailTop: cssHeight,
    hasTail: false,
    blocks: [],
  };
}

/**
 * Where to cut between the body and the tail.
 *
 * Insurance, not the mechanism: what keeps סה"כ off the notes page is measuring
 * the clone, and this would not have fixed it on its own.
 *
 * What it does buy is tolerance. The margin between the last body block and the
 * first tail block is dead space, so cutting anywhere inside it looks identical
 * — and cutting down the middle means it takes half that gap of error, rather
 * than half a pixel, to land a line on the wrong page.
 */
function tailCutPoint(tailTop, blocks) {
  // Bottom of the last body line (סה"כ), and top of the first tail line (הערות).
  let gapStart = -Infinity;
  let gapEnd = Infinity;

  for (const b of blocks) {
    if (b.bottom <= tailTop + 0.5) gapStart = Math.max(gapStart, b.bottom);
    else if (b.top >= tailTop - 0.5) gapEnd = Math.min(gapEnd, b.top);
  }

  if (!Number.isFinite(gapStart) || !Number.isFinite(gapEnd)) return tailTop;

  return gapEnd > gapStart ? (gapStart + gapEnd) / 2 : tailTop;
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

/**
 * Copy a horizontal band out of the full capture into its own canvas.
 *
 * html2canvas paints through `ctx.scale(s, s); ctx.translate(-x, -y)`, so an
 * offset from the top of the preview maps to `offset * CAPTURE_SCALE` canvas px
 * exactly — there is no ratio to measure. The canvas comes out a pixel or two
 * taller than that because its height is rounded, and those rows are background
 * rather than stretch.
 *
 * Both edges are rounded independently so consecutive slices tile: the row a
 * page ends on is the row the next page starts on.
 */
function sliceCanvas(source, fromPx, heightPx, cssWidth) {
  const sy = Math.round(fromPx * CAPTURE_SCALE);
  const sWidth = Math.min(Math.round(cssWidth * CAPTURE_SCALE), source.width);
  const sHeight = Math.min(
    Math.round((fromPx + heightPx) * CAPTURE_SCALE) - sy,
    source.height - sy
  );

  const out = document.createElement("canvas");
  out.width = Math.max(1, sWidth);
  out.height = Math.max(1, sHeight);

  const ctx = out.getContext("2d");
  ctx.fillStyle = BRAND.paper;
  ctx.fillRect(0, 0, out.width, out.height);
  // Clamped above, so in practice always true — kept to cap a future regression.
  if (sHeight > 0 && sWidth > 0) {
    ctx.drawImage(source, 0, sy, sWidth, sHeight, 0, 0, sWidth, sHeight);
  }

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

  // Geometry comes from inside the capture — see measurePreview.
  let measured = null;

  const canvas = await html2canvas(element, {
    scale: CAPTURE_SCALE,
    backgroundColor: BRAND.paper,
    useCORS: true,
    logging: false,
    windowWidth: CAPTURE_VIEWPORT_WIDTH,
    windowHeight: CAPTURE_VIEWPORT_HEIGHT,
    // Nothing here depends on where the real page happens to be scrolled to.
    scrollX: 0,
    scrollY: 0,
    onclone: (_clonedDoc, clonedEl) => {
      try {
        if (!clonedEl) return;
        // Pin the width so the export cannot be resized by the operator's
        // window, or by a later change to the layout around the preview.
        clonedEl.style.width = `${PREVIEW_WIDTH_PX}px`;
        clonedEl.style.maxWidth = `${PREVIEW_WIDTH_PX}px`;
        measured = measurePreview(clonedEl);
      } catch (err) {
        // html2canvas awaits this callback, so a throw here would reject the
        // whole export. A worse PDF beats no PDF.
        console.warn("[exportPdf] clone measurement failed", err);
      }
    },
  });

  // Safe to read only after the await: html2canvas runs onclone to completion
  // before it resolves.
  const { cssWidth, cssHeight, tailTop, hasTail, blocks } =
    measured ?? fallbackMeasurement(canvas);

  if (!(cssWidth > 0) || !(cssHeight > 0)) {
    throw new Error("התצוגה המקדימה ריקה — לא ניתן לייצר PDF.");
  }

  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

  // ── Page 1: branded cover, full bleed ──
  pdf.addImage(await getCoverImage(), "JPEG", 0, 0, A4_WIDTH_MM, A4_HEIGHT_MM);

  const usableHeightMm = A4_HEIGHT_MM - MARGIN_TOP_MM - MARGIN_BOTTOM_MM;
  const pxPerMm = cssWidth / A4_WIDTH_MM;
  const pageHeightPx = usableHeightMm * pxPerMm;

  // ── Body pages: everything above the tail ──
  // The notes open the last page, so the total above them has to stay on the
  // page before it — the cut goes in the whitespace that separates the two.
  const bodyEndPx = hasTail ? tailCutPoint(tailTop, blocks) : cssHeight;
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
    // Starts where the body stopped, so no band of the capture is dropped
    // or drawn twice.
    const tailHeightPx = cssHeight - bodyEndPx;
    const tailHeightMm = tailHeightPx / pxPerMm;

    // Shrink to fit rather than spilling onto a second page.
    const fit = Math.min(1, usableHeightMm / tailHeightMm);
    if (fit < 0.6) {
      // Notes are 11.5px on screen, so much past this they stop being readable.
      console.warn(
        `[exportPdf] notes + appendix shrunk to ${Math.round(fit * 100)}% to fit one page`
      );
    }
    const drawWidthMm = A4_WIDTH_MM * fit;
    const drawHeightMm = tailHeightMm * fit;

    pdf.addPage();
    pdf.addImage(
      sliceCanvas(canvas, bodyEndPx, tailHeightPx, cssWidth),
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
