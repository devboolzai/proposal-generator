import {
  STATUS,
  isExpired,
  isValidToken,
  paths,
  signedFileName,
} from "../../shared/proposal.js";
import { readBytes, readMeta } from "./_lib/store.js";
import { allowMethod, fail, httpError } from "../../shared/http.js";

// GET /api/proposal-pdf?token=…[&download=1]
//
// The blobs are private and have no public URL, so this is the only way to
// read one. Routing the bytes through a function is what makes the expiry
// real rather than decorative: an unguessable URL cannot expire, a checked
// token can.
//
// Serves the signed copy once it exists, so the same link keeps working for
// the client after they sign.

export default async function handler(req, res) {
  if (!allowMethod(req, res, "GET")) return;

  try {
    const { token, download } = req.query;
    if (!isValidToken(token)) throw httpError(404, "ההצעה לא נמצאה");

    const meta = await readMeta(token);
    if (!meta) throw httpError(404, "ההצעה לא נמצאה");
    if (meta.status === STATUS.PENDING) throw httpError(404, "ההצעה עדיין לא מוכנה");
    if (meta.status !== STATUS.SIGNED && isExpired(meta)) {
      throw httpError(410, "תוקף הקישור פג");
    }

    const key = paths(token);
    const isSigned = meta.status === STATUS.SIGNED;
    const bytes = await readBytes(isSigned ? key.signed : key.original);
    if (!bytes) throw httpError(404, "הקובץ לא נמצא");

    const fileName = isSigned ? signedFileName(meta.fileName) : meta.fileName;

    res.setHeader("content-type", "application/pdf");
    res.setHeader("content-length", String(bytes.byteLength));
    res.setHeader(
      "content-disposition",
      `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );
    // Never cached: the same URL serves the unsigned document before signing
    // and the signed one after.
    res.setHeader("cache-control", "private, no-store");
    res.statusCode = 200;
    res.end(Buffer.from(bytes));
  } catch (err) {
    fail(res, err, 404);
  }
}
