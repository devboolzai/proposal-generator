import {
  DOCX_CONTENT_TYPE,
  STATUS,
  docxFileName,
  isValidToken,
  paths,
  signedFileName,
} from "../shared/proposal.js";
import { readBytes, readMeta } from "./_lib/store.js";
import { allowMethod, fail, httpError, requireAccessCode } from "../shared/http.js";

// GET /api/proposal-file?token=…&kind=original|signed|docx
//
// The archive's download route. Its twin on the client side is
// sign/api/proposal-pdf.js, but the two answer different people and so differ
// in two deliberate ways:
//
//   - No expiry check. Expiry exists to stop a *client* signing a stale offer;
//     the salesperson's own archive must not go dark thirty days later.
//   - The access code, which that route cannot ask for and this one requires.
//
// Still read-only, and still routed through a function: the blobs are private
// and have no public URL, so this is the only way to read one.

const KINDS = {
  original: {
    key: "original",
    contentType: "application/pdf",
    fileName: (meta) => meta.fileName,
  },
  signed: {
    key: "signed",
    contentType: "application/pdf",
    fileName: (meta) => signedFileName(meta.fileName),
  },
  docx: {
    key: "docx",
    contentType: DOCX_CONTENT_TYPE,
    fileName: (meta) => docxFileName(meta.fileName),
  },
};

export default async function handler(req, res) {
  if (!allowMethod(req, res, "GET")) return;
  if (!requireAccessCode(req, res)) return;

  try {
    const { token, kind } = req.query;
    if (!isValidToken(token)) throw httpError(404, "ההצעה לא נמצאה");

    const spec = KINDS[kind];
    if (!spec) throw httpError(400, "סוג קובץ לא חוקי");

    const meta = await readMeta(token);
    if (!meta) throw httpError(404, "ההצעה לא נמצאה");
    if (spec.key === "signed" && meta.status !== STATUS.SIGNED) {
      throw httpError(404, "ההצעה עדיין לא נחתמה");
    }

    const bytes = await readBytes(paths(token)[spec.key]);
    // A proposal sent before the Word copy was archived has no docx, which is
    // expected rather than broken — the archive greys the button out, and this
    // is the message if one is clicked anyway.
    if (!bytes) throw httpError(404, "הקובץ לא נמצא");

    const fileName = spec.fileName(meta);

    res.setHeader("content-type", spec.contentType);
    res.setHeader("content-length", String(bytes.byteLength));
    res.setHeader(
      "content-disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );
    res.setHeader("cache-control", "private, no-store");
    res.statusCode = 200;
    res.end(Buffer.from(bytes));
  } catch (err) {
    fail(res, err, 404);
  }
}
