import { STATUS, newMeta, newToken, paths } from "../shared/proposal.js";
import { findByProposalId, writeMeta } from "./_lib/store.js";
import { allowMethod, fail, httpError, readBody, requireAccessCode, sendJson } from "../shared/http.js";

// POST /api/proposal-create
//
// Step 1 of 3. Mints the token and writes the record as `pending`.
// The PDF is uploaded straight from the browser afterwards (it is
// too large for a function body), and `proposal-ready` closes the
// loop once the bytes have landed.
//
// The proposal number is not minted here: it was allocated by
// /api/proposal-id when the preview opened, so that it could be
// printed into the PDF the browser is about to upload. The browser
// echoes it back and newMeta re-validates it.

export default async function handler(req, res) {
  if (!allowMethod(req, res, "POST")) return;
  if (!requireAccessCode(req, res)) return;

  try {
    const {
      proposalId,
      clientName,
      companyName,
      subject,
      clientEmail,
      fileName,
      expiresInDays,
    } = readBody(req);

    // Sending a number again replaces the earlier send (see proposal-ready),
    // but a signed one is final: the client agreed to that document.
    const existing = await findByProposalId(proposalId);
    if (existing.some((meta) => meta.status === STATUS.SIGNED)) {
      throw httpError(
        409,
        `הצעה מס' ${proposalId} כבר נחתמה ולא ניתן לשלוח אותה מחדש. יש ליצור הצעה חדשה.`,
      );
    }

    const token = newToken();
    const meta = newMeta({
      token,
      proposalId,
      clientName,
      companyName,
      subject,
      clientEmail,
      fileName,
      expiresInDays,
    });

    await writeMeta(token, meta);

    // The browser uploads the PDF itself, so hand it the destination rather
    // than making it build one — that keeps the path rules on the server,
    // where blob-upload re-validates them anyway.
    const key = paths(token);
    sendJson(res, 201, {
      token,
      proposalId: meta.proposalId,
      pathname: key.original,
      docxPathname: key.docx,
      expiresAt: meta.expiresAt,
    });
  } catch (err) {
    // newMeta throws on bad input — that is a 400, not a server fault.
    fail(res, err, 400);
  }
}
