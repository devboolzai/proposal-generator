import { allocateProposalId } from "./_lib/proposalId.js";
import { allowMethod, fail, requireAccessCode, sendJson } from "../shared/http.js";

// POST /api/proposal-id
//
// Hands the browser the next proposal number, called once when the preview
// screen opens. Every call consumes a number, so the client must ask exactly
// once per proposal and hold on to the answer — see ensureProposalId in
// src/state/useProposal.jsx.
//
// Access-code guarded like every other write route: without it, anyone who
// found the generator's URL could run the counter up.

export default async function handler(req, res) {
  if (!allowMethod(req, res, "POST")) return;
  if (!requireAccessCode(req, res)) return;

  try {
    sendJson(res, 201, { proposalId: await allocateProposalId() });
  } catch (err) {
    fail(res, err);
  }
}
