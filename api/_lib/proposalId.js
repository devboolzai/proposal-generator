import { open, rm, stat, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { COUNTER_PATH, takeProposalId } from "../../shared/proposal.js";
import { readCounter, writeCounter } from "./store.js";
import { resolveInRoot } from "../../shared/fsStore.js";

// ============================================================
// Handing out the next proposal number.
//
// Read the counter, take the number, write the counter back.
// The arithmetic and the corrupt-counter rules live in
// shared/proposal.js; this is only the round-trip.
//
// ATOMIC, unlike the Blob version this replaces. Two guards,
// because they cover different failures:
//
//   - an in-process queue, because one Node process serving
//     concurrent requests is the case that actually happens
//   - an O_EXCL lockfile, because a second process (a migration
//     script, a stray `node`) must not be able to interleave
//
// Losing the write after a number has been read is still the
// safe direction: it throws, so the number is never used. A
// number burned by a proposal that is never sent leaves a gap,
// which is expected and harmless.
// ============================================================

const LOCK_PATH = `${COUNTER_PATH}.lock`;
const LOCK_POLL_MS = 50;
const LOCK_ATTEMPTS = 200; // 10s
const LOCK_STALE_MS = 30_000;

/**
 * Serialises allocations inside this process. Each call chains onto the
 * previous one; a rejection is swallowed for the chain's purposes so one
 * failed allocation cannot wedge every later one.
 */
let queue = Promise.resolve();

export function allocateProposalId() {
  const result = queue.then(allocateOnce, allocateOnce);
  queue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function allocateOnce() {
  const release = await acquireLock();
  try {
    const { proposalId, counter } = takeProposalId(await readCounter());
    await writeCounter(counter);
    return proposalId;
  } finally {
    await release();
  }
}

async function acquireLock() {
  const lock = resolveInRoot(LOCK_PATH);
  await mkdir(dirname(lock), { recursive: true });

  for (let attempt = 0; attempt < LOCK_ATTEMPTS; attempt += 1) {
    try {
      const handle = await open(lock, "wx");
      await handle.close();
      return async () => {
        await rm(lock, { force: true });
      };
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
      await breakIfStale(lock);
      await sleep(LOCK_POLL_MS);
    }
  }

  throw new Error(
    "Could not acquire the proposal id lock — refusing to allocate a number that may already be in use",
  );
}

/**
 * A process killed mid-allocation leaves its lockfile behind, which would
 * otherwise block every future proposal. Anything older than the longest
 * plausible allocation is treated as abandoned.
 */
async function breakIfStale(lock) {
  try {
    const info = await stat(lock);
    if (Date.now() - info.mtimeMs > LOCK_STALE_MS) {
      await rm(lock, { force: true });
    }
  } catch {
    // Gone already, or unreadable — the next open() attempt decides.
  }
}
