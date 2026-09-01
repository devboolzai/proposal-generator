import { STATUS, assertTransition, paths } from "../shared/proposal.js";
import { blobExists, readMeta, writeMeta } from "./_lib/store.js";
import { allowMethod, fail, httpError, readBody, requireAccessCode, sendJson } from "../shared/http.js";
import { signUrlFor } from "./_lib/signUrl.js";

// POST /api/proposal-ready  { token }
//
// Step 3 of 3. Confirms the PDF really landed in Blob and flips the record to
// `sent`, which is the point at which the link becomes usable. Sending the
// invitation email is a separate call, so a mail failure can never leave a
// proposal stranded between states.

export default async function handler(req, res) {
  if (!allowMethod(req, res, "POST")) return;
  if (!requireAccessCode(req, res)) return;

  try {
    const { token } = readBody(req);
    const meta = await readMeta(token);
    if (!meta) throw httpError(404, "ההצעה לא נמצאה");

    // Idempotent: a retried request after a dropped response should hand back
    // the same link rather than fail on the transition guard.
    if (meta.status === STATUS.PENDING) {
      if (!(await blobExists(paths(token).original))) {
        throw httpError(409, "קובץ ה-PDF לא נמצא. יש לנסות ליצור את הקישור שוב.");
      }
      assertTransition(meta.status, STATUS.SENT);
      meta.status = STATUS.SENT;
      await writeMeta(token, meta);
    }

    sendJson(res, 200, {
      token,
      status: meta.status,
      expiresAt: meta.expiresAt,
      signUrl: signUrlFor(token),
    });
  } catch (err) {
    fail(res, err);
  }
}
