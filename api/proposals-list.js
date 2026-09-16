import { STATUS } from "../shared/proposal.js";
import { listProposals } from "./_lib/store.js";
import { allowMethod, fail, requireAccessCode, sendJson } from "../shared/http.js";

// GET /api/proposals-list
//
// The archive: every proposal that actually reached a client, newest first.
//
// "Reached a client" means linkEmailedAt is set, which happens in exactly one
// place — proposal-send-link, after Resend accepted the message. A record whose
// link was created but never mailed is a draft the salesperson abandoned, and
// listing those would bury the real ones.
//
// Signed proposals are always included: a proposal cannot be signed without
// having been sent, and older records signed before this route existed still
// carry the timestamp.

export default async function handler(req, res) {
  if (!allowMethod(req, res, "GET")) return;
  if (!requireAccessCode(req, res)) return;

  try {
    const rows = (await listProposals())
      // A superseded record was replaced by a later send of the same number,
      // which is listed in its place.
      .filter(({ meta }) => meta.status !== STATUS.SUPERSEDED)
      .filter(({ meta }) => meta.linkEmailedAt || meta.status === STATUS.SIGNED)
      .map(({ meta, has }) => ({
        token: meta.token,
        proposalId: meta.proposalId,
        subject: meta.subject || "",
        clientName: meta.clientName || "",
        companyName: meta.companyName || "",
        clientEmail: meta.clientEmail || "",
        status: meta.status,
        // The date the archive sorts and shows by: when the client got it.
        // createdAt is the fallback for a record mailed before the field
        // existed, so a row can never render without a date.
        sentAt: meta.linkEmailedAt || meta.createdAt,
        signedAt: meta.signedAt ?? null,
        signerName: meta.signerName ?? null,
        // Which buttons the row may offer. Taken from the store rather than
        // inferred from status, so a proposal sent before the Word copy was
        // archived shows DOC as unavailable instead of offering a dead link.
        has,
      }))
      // Newest send first, by the actual timestamp.
      //
      // NOT by proposalId. That was the first attempt and it put freshly sent
      // proposals into the middle of the list: the numbers in the store do not
      // run in send order, so they cannot stand in for a date.
      //
      // An unparsable date sorts last rather than scrambling the rest — it is
      // the one row a person cannot place by eye anyway.
      .sort((a, b) => {
        const at = Date.parse(a.sentAt);
        const bt = Date.parse(b.sentAt);
        if (Number.isNaN(at) && Number.isNaN(bt)) return b.proposalId - a.proposalId;
        if (Number.isNaN(at)) return 1;
        if (Number.isNaN(bt)) return -1;
        return bt - at;
      });

    // The listing changes on every send and every signature; a cached copy
    // would show a salesperson an archive missing the proposal they just sent.
    res.setHeader("cache-control", "private, no-store");
    sendJson(res, 200, { proposals: rows });
  } catch (err) {
    fail(res, err);
  }
}
