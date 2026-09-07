import { isValidToken, isExpired } from "../../shared/proposal.js";
import { readMeta } from "./_lib/store.js";
import { allowMethod, fail, httpError, sendJson } from "../../shared/http.js";

// GET /api/proposal-get?token=…
//
// What the signing page needs to render itself. Public by design — the token
// is the credential — so the response is filtered down to what the client
// already knows about themselves. The email address and the audit fields
// stay on the server.

export default async function handler(req, res) {
  if (!allowMethod(req, res, "GET")) return;

  try {
    const { token } = req.query;
    // Check the shape first so a malformed link gets the same Hebrew "not
    // found" a real miss does, rather than an internal error message.
    if (!isValidToken(token)) throw httpError(404, "ההצעה לא נמצאה");

    const meta = await readMeta(token);
    if (!meta) throw httpError(404, "ההצעה לא נמצאה");
    // A signed proposal stays readable, so the client can still fetch their
    // copy; an expired one does not.
    if (meta.status !== "signed" && isExpired(meta)) {
      throw httpError(410, "תוקף הקישור פג");
    }

    sendJson(res, 200, {
      status: meta.status,
      // Not a secret — it is printed on the PDF the client is about to read,
      // and having it on screen is what lets them quote it back to us.
      proposalId: meta.proposalId ?? null,
      clientName: meta.clientName,
      companyName: meta.companyName,
      subject: meta.subject,
      expiresAt: meta.expiresAt,
      signedAt: meta.signedAt,
    });
  } catch (err) {
    // An invalid token shape throws out of readMeta; that is a 404 to the
    // client, not a server error.
    fail(res, err, 404);
  }
}
