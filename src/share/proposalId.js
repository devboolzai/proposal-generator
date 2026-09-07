import { postJson } from "./api";

// ============================================================
// Asking the server for this proposal's number.
//
// One call per proposal, ever: the endpoint advances a counter,
// so a second call would silently burn a number and change the
// number on a proposal the salesperson is already looking at.
// The "ask exactly once" rule is enforced by ensureProposalId in
// src/state/useProposal.jsx — never call this from a component.
// ============================================================

export async function requestProposalId(accessCode) {
  const { proposalId } = await postJson("/api/proposal-id", {}, accessCode);

  // A number is about to be printed onto a document that goes to a client;
  // a string or a null would render as junk rather than fail.
  if (!Number.isInteger(proposalId)) {
    throw new Error("השרת החזיר מספר הצעה לא תקין");
  }
  return proposalId;
}
