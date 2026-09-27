import { readdir, stat } from "node:fs/promises";
import {
  COUNTER_PATH,
  PROPOSALS_PREFIX,
  isSupersededBy,
  isValidToken,
  paths,
  supersede,
} from "../../shared/proposal.js";
import { readFileOrNull, resolveInRoot, writeAtomic } from "./fsStore.js";

// ============================================================
// Store I/O for this project.
//
// The shape of the data — paths, statuses, expiry — is defined
// once in shared/proposal.js. This file is only the wire: it
// exists per-project rather than in shared/ so that the signing
// app can deploy from sign/ without reaching above its own root.
//
// Its twin is sign/api/_lib/store.js. Keep them in step.
// ============================================================

/** The record, or null when the token names nothing. */
export async function readMeta(token) {
  const raw = await readFileOrNull(paths(token).meta);
  if (raw === null) return null;
  return JSON.parse(raw.toString("utf8"));
}

export async function writeMeta(token, meta) {
  await writeAtomic(paths(token).meta, JSON.stringify(meta, null, 2));
  return meta;
}

/** Raw bytes of a stored file, or null when it is not there. */
export async function readBytes(pathname) {
  const buf = await readFileOrNull(pathname);
  return buf === null ? null : new Uint8Array(buf);
}

export async function writePdf(pathname, bytes) {
  await writeAtomic(pathname, Buffer.from(bytes));
  return { pathname };
}

export async function fileExists(pathname) {
  try {
    await stat(resolveInRoot(pathname));
    return true;
  } catch {
    return false;
  }
}

/** Kept under its old name so callers written against Blob do not change. */
export const blobExists = fileExists;

/**
 * Every proposal in the store, as `{ meta, has }` — `has` saying which of the
 * token's other files exist.
 *
 * Still one read per proposal rather than an index, for the same reason as
 * before: the signing app writes meta.json when a client signs and knows
 * nothing about this project, so anything cached on this side would show
 * signed proposals as unsigned. Reading the records keeps the archive right
 * by construction. On a local disk this is cheap.
 */
export async function listProposals() {
  let entries;
  try {
    entries = await readdir(resolveInRoot(PROPOSALS_PREFIX), {
      withFileTypes: true,
    });
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }

  const records = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && isValidToken(entry.name))
      .map(async (entry) => {
        const token = entry.name;
        // A folder without a readable record is not a proposal — a
        // half-finished upload, most likely. Skipped rather than surfaced as
        // a broken row.
        const meta = await readMeta(token).catch(() => null);
        if (!meta) return null;

        const key = paths(token);
        const [original, signed, docx] = await Promise.all([
          fileExists(key.original),
          fileExists(key.signed),
          fileExists(key.docx),
        ]);

        return { meta, has: { original, signed, docx } };
      }),
  );

  return records.filter(Boolean);
}

/** Every record carrying this proposal number, in no particular order. */
export async function findByProposalId(proposalId) {
  return (await listProposals())
    .map(({ meta }) => meta)
    .filter((meta) => meta.proposalId === proposalId);
}

/**
 * Retire every earlier record of this proposal number, now that `token` is
 * the live one: their links expire and the archive stops listing them.
 *
 * Each record is re-read right before it is rewritten, so a client who signed
 * the old link a moment ago keeps their signature rather than having it
 * overwritten by a listing that was already stale.
 *
 * @returns {Promise<string[]>} the tokens that were retired
 */
export async function supersedeOthers(proposalId, token, now = new Date()) {
  const candidates = (await findByProposalId(proposalId)).filter((meta) =>
    isSupersededBy(meta, proposalId, token),
  );

  const retired = await Promise.all(
    candidates.map(async ({ token: oldToken }) => {
      const fresh = await readMeta(oldToken);
      if (!isSupersededBy(fresh, proposalId, token)) return null;
      await writeMeta(oldToken, supersede(fresh, token, now));
      return oldToken;
    }),
  );

  return retired.filter(Boolean);
}

/**
 * The proposal-number counter, or null when it has never been written.
 *
 * Only a genuine absence may return null — that is what seeds the very first
 * proposal. A file that exists but will not parse has to throw, because
 * seeding on top of an existing store would re-issue numbers that are already
 * on documents with clients.
 */
export async function readCounter() {
  const raw = await readFileOrNull(COUNTER_PATH);
  if (raw === null) return null;
  try {
    return JSON.parse(raw.toString("utf8"));
  } catch {
    throw new Error("Could not read the proposal id counter");
  }
}

export async function writeCounter(counter) {
  await writeAtomic(COUNTER_PATH, JSON.stringify(counter, null, 2));
  return counter;
}
