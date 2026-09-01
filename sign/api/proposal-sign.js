import { PDFDocument } from "pdf-lib";
import {
  STATUS,
  assertTransition,
  isExpired,
  isValidToken,
  paths,
  signedFileName,
} from "../../shared/proposal.js";
import { readBytes, readMeta, writeMeta, writePdf } from "./_lib/store.js";
import {
  allowMethod,
  fail,
  header,
  httpError,
  originOf,
  readBody,
  sendJson,
} from "../../shared/http.js";
import { sendSignedProposal } from "./_lib/mail.js";

// POST /api/proposal-sign  { token, signerName, consent, signatureBlockPng }
//
// Appends the confirmation page to the PDF and mails the result.
//
// The Hebrew was already typeset and rasterised by the client's browser, so
// all that happens here is embedPng + addPage — pdf-lib never has to reason
// about a script it cannot lay out.

const A4_PORTRAIT = [595.28, 841.89]; // points
const MARGIN = 40;

// A Vercel Function body caps out at 4.5MB and base64 inflates by a third, so
// anything approaching this is a malformed or hostile request rather than a
// confirmation page — the real one is a mostly-white raster of a few hundred KB.
const MAX_PNG_BYTES = 3 * 1024 * 1024;

export default async function handler(req, res) {
  if (!allowMethod(req, res, "POST")) return;

  let meta;
  let token;

  try {
    const body = readBody(req);
    token = body.token;
    const signerName = String(body.signerName ?? "").trim();

    if (!isValidToken(token)) throw httpError(404, "ההצעה לא נמצאה");
    if (signerName.length < 2) throw httpError(400, "יש להזין שם מלא");
    if (body.consent !== true) throw httpError(400, "יש לאשר את תנאי ההצעה");

    const png = decodePng(body.signatureBlockPng);

    meta = await readMeta(token);
    if (!meta) throw httpError(404, "ההצעה לא נמצאה");
    if (meta.status === STATUS.SIGNED) throw httpError(409, "ההצעה כבר נחתמה");
    if (isExpired(meta)) throw httpError(410, "תוקף הקישור פג");
    assertTransition(meta.status, STATUS.SIGNED);

    const key = paths(token);
    const original = await readBytes(key.original);
    if (!original) throw httpError(409, "קובץ ההצעה לא נמצא");

    const signedBytes = await appendSignaturePage(original, png);
    await writePdf(key.signed, signedBytes);

    meta.status = STATUS.SIGNED;
    meta.signedAt = new Date().toISOString();
    meta.signerName = signerName;
    meta.signerIp = header(req, "x-forwarded-for") ?? null;
    meta.signerUserAgent = header(req, "user-agent") ?? null;
    await writeMeta(token, meta);

    // Past this line the signature is durable. A mail failure is reported,
    // never thrown: telling a client their signature failed when it is
    // already stored would invite a second attempt that cannot succeed.
    let mailed = false;
    try {
      mailed = await sendSignedProposal({
        meta,
        pdfBytes: signedBytes,
        fileName: signedFileName(meta.fileName),
        downloadUrl: `${originOf(req)}/api/proposal-pdf?token=${encodeURIComponent(token)}&download=1`,
      });
    } catch (mailErr) {
      console.error("signed-proposal mail failed", mailErr);
    }

    sendJson(res, 200, { ok: true, mailed, signedAt: meta.signedAt });
  } catch (err) {
    fail(res, err, 400);
  }
}

export async function appendSignaturePage(originalBytes, pngBytes) {
  const pdf = await PDFDocument.load(originalBytes);
  const image = await pdf.embedPng(pngBytes);
  const page = pdf.addPage(A4_PORTRAIT);

  page.drawImage(image, fitWithinMargins(image.width, image.height));

  return pdf.save();
}

/**
 * Place the confirmation image centred horizontally and hugging the top
 * margin, scaled down to fit but never blown up past its natural size.
 *
 * The block is rasterised at 2x on the client, so a phone in portrait can
 * easily hand over an image several times wider than the page.
 */
export function fitWithinMargins(imageWidth, imageHeight) {
  const [pageWidth, pageHeight] = A4_PORTRAIT;
  const scale = Math.min(
    (pageWidth - MARGIN * 2) / imageWidth,
    (pageHeight - MARGIN * 2) / imageHeight,
    1,
  );
  const width = imageWidth * scale;
  const height = imageHeight * scale;

  return {
    x: (pageWidth - width) / 2,
    y: pageHeight - MARGIN - height, // top-aligned, like every other page
    width,
    height,
  };
}

/** The PNG arrives as a data URL from the browser, so it is untrusted input. */
export function decodePng(dataUrl) {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl ?? "");
  if (!match) throw httpError(400, "החתימה לא נקלטה. יש לנסות שוב.");

  const bytes = Buffer.from(match[1], "base64");
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_PNG_BYTES) {
    throw httpError(400, "החתימה לא נקלטה. יש לנסות שוב.");
  }
  // PNG magic number — a base64 blob of anything else must not reach pdf-lib.
  if (bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw httpError(400, "החתימה לא נקלטה. יש לנסות שוב.");
  }
  return bytes;
}
