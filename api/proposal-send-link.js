import { STATUS, isExpired } from "../shared/proposal.js";
import { readMeta, writeMeta } from "./_lib/store.js";
import { allowMethod, fail, httpError, readBody, requireAccessCode, sendJson } from "../shared/http.js";
import { sendSignLink } from "./_lib/mail.js";
import { signUrlFor } from "./_lib/signUrl.js";

// POST /api/proposal-send-link  { token }
//
// Emails the client their invitation. Kept apart from proposal-ready so that
// a Resend outage costs nothing but a retry — the proposal and its link are
// already valid, and the salesperson can still copy the link by hand.
//
// Safe to call more than once: "send again" is a real thing salespeople need.

export default async function handler(req, res) {
  if (!allowMethod(req, res, "POST")) return;
  if (!requireAccessCode(req, res)) return;

  try {
    const { token } = readBody(req);
    const meta = await readMeta(token);

    if (!meta) throw httpError(404, "ההצעה לא נמצאה");
    if (meta.status === STATUS.PENDING) {
      throw httpError(409, "הקישור עדיין לא מוכן לשליחה");
    }
    if (meta.status === STATUS.SIGNED) {
      throw httpError(409, "ההצעה כבר נחתמה");
    }
    if (isExpired(meta)) throw httpError(410, "תוקף הקישור פג");

    await sendSignLink({ meta, signUrl: signUrlFor(token) });

    meta.linkEmailedAt = new Date().toISOString();
    await writeMeta(token, meta);

    sendJson(res, 200, { sentTo: meta.clientEmail, sentAt: meta.linkEmailedAt });
  } catch (err) {
    fail(res, err, 502);
  }
}
