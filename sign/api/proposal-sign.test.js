import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { appendSignaturePage, decodePng, fitWithinMargins } from "./proposal-sign.js";

// A real 4x2 PNG, pinned here so the tests exercise the actual decode and
// embed paths and there is no fixture file to lose.
const PNG_4x2_DATA_URL =
  "data:image/png;base64," +
  "iVBORw0KGgoAAAANSUhEUgAAAAQAAAACCAYAAACddGYaAAAAFUlEQVR4nGP8//8/AzbAxIAD" +
  "jEoMLQkAdKgESHjbYVQAAAAASUVORK5CYII=";

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN = 40;

async function blankPdf(pages = 3) {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pages; i++) pdf.addPage([595.28, 841.89]);
  return pdf.save();
}

describe("decodePng", () => {
  it("accepts a real PNG data URL", () => {
    const bytes = decodePng(PNG_4x2_DATA_URL);
    expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  });

  it("rejects anything that is not a PNG data URL", () => {
    for (const bad of [
      undefined,
      "",
      "not-a-data-url",
      "data:image/jpeg;base64,/9j/4AAQ",
      "data:text/html;base64,PHNjcmlwdD4=",
    ]) {
      expect(() => decodePng(bad)).toThrow();
    }
  });

  it("rejects base64 that decodes to something other than a PNG", () => {
    // Correctly shaped data URL, wrong magic number — this is the case a
    // regex on the prefix alone would wave through to pdf-lib.
    const notPng = Buffer.from("GIF89a this is not a png").toString("base64");
    expect(() => decodePng(`data:image/png;base64,${notPng}`)).toThrow();
  });

  it("rejects an empty payload", () => {
    expect(() => decodePng("data:image/png;base64,")).toThrow();
  });
});

describe("fitWithinMargins", () => {
  const inside = ({ x, y, width, height }) =>
    x >= MARGIN - 0.01 &&
    y >= MARGIN - 0.01 &&
    x + width <= A4_WIDTH - MARGIN + 0.01 &&
    y + height <= A4_HEIGHT - MARGIN + 0.01;

  it("shrinks an oversized block to fit inside the margins", () => {
    // The real case: the block is 760 CSS px captured at 2x, so ~1520 wide —
    // more than twice the width of an A4 page in points.
    const box = fitWithinMargins(1520, 2100);
    expect(inside(box)).toBe(true);
  });

  it("keeps a very wide block inside the horizontal margins", () => {
    const box = fitWithinMargins(4000, 200);
    expect(inside(box)).toBe(true);
    expect(box.width).toBeCloseTo(A4_WIDTH - MARGIN * 2, 1);
  });

  it("keeps a very tall block inside the vertical margins", () => {
    const box = fitWithinMargins(200, 4000);
    expect(inside(box)).toBe(true);
    expect(box.height).toBeCloseTo(A4_HEIGHT - MARGIN * 2, 1);
  });

  it("never enlarges a block smaller than the page", () => {
    const box = fitWithinMargins(100, 60);
    expect(box.width).toBe(100);
    expect(box.height).toBe(60);
    expect(inside(box)).toBe(true);
  });

  it("centres horizontally and hugs the top margin", () => {
    const box = fitWithinMargins(200, 100);
    expect(box.x).toBeCloseTo((A4_WIDTH - 200) / 2, 5);
    expect(box.y + box.height).toBeCloseTo(A4_HEIGHT - MARGIN, 5);
  });

  it("preserves the aspect ratio", () => {
    const box = fitWithinMargins(1520, 760);
    expect(box.width / box.height).toBeCloseTo(2, 5);
  });
});

describe("appendSignaturePage", () => {
  it("adds exactly one page to the end", async () => {
    const signed = await appendSignaturePage(await blankPdf(3), decodePng(PNG_4x2_DATA_URL));
    const reloaded = await PDFDocument.load(signed);
    expect(reloaded.getPageCount()).toBe(4);
  });

  it("makes the signature page A4 portrait, like the rest of the document", async () => {
    const signed = await appendSignaturePage(await blankPdf(1), decodePng(PNG_4x2_DATA_URL));
    const { width, height } = (await PDFDocument.load(signed)).getPage(1).getSize();

    expect(width).toBeCloseTo(A4_WIDTH, 1);
    expect(height).toBeCloseTo(A4_HEIGHT, 1);
  });

  it("produces a document that still parses as a PDF", async () => {
    const signed = await appendSignaturePage(await blankPdf(2), decodePng(PNG_4x2_DATA_URL));
    expect(Buffer.from(signed.subarray(0, 5)).toString()).toBe("%PDF-");
  });

  it("refuses a PDF it cannot parse rather than emitting a broken one", async () => {
    await expect(
      appendSignaturePage(Buffer.from("not a pdf at all"), decodePng(PNG_4x2_DATA_URL)),
    ).rejects.toThrow();
  });
});
