import { takeProposalId } from "../../shared/proposal.js";
import { readCounter, writeCounter } from "./store.js";

// ============================================================
// Handing out the next proposal number.
//
// Read the counter, take the number, write the counter back.
// The arithmetic and the corrupt-counter rules live in
// shared/proposal.js; this is only the Blob round-trip.
//
// NOT ATOMIC, on purpose. Blob has no compare-and-swap, so two
// allocations that overlap in time would both read the same
// counter and both be handed the same number. The team works one
// proposal at a time, which is the assumption this rests on — if
// that ever stops being true this is the thing to replace, with a
// store that can do a conditional write.
//
// Losing the write after a number has been read is the safe
// direction: it throws, so the number is simply never used.
// A number burned by a proposal that is never sent leaves a gap,
// which is expected and harmless.
// ============================================================

export async function allocateProposalId() {
  const { proposalId, counter } = takeProposalId(await readCounter());
  await writeCounter(counter);
  return proposalId;
}
