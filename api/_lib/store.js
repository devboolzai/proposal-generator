import { get, head, list, put } from "@vercel/blob";
import {
  COUNTER_PATH,
  COUNTER_PUT_OPTIONS,
  META_PUT_OPTIONS,
  PDF_PUT_OPTIONS,
  PRIVATE,
  PROPOSALS_PREFIX,
  paths,
  tokenFromPath,
} from "../../shared/proposal.js";

// ============================================================
// Blob I/O for this project.
//
// The shape of the data — paths, statuses, expiry — is defined
// once in shared/proposal.js. This file is only the wire: it
// exists per-project rather than in shared/ so that
// `@vercel/blob` resolves from the project's own node_modules,
// which is what lets the signing app deploy with its Root
// Directory set to sign/.
//
// Its twin is sign/api/_lib/store.js. Keep them in step.
// ============================================================

/** The record, or null when the token names nothing. */
export async function readMeta(token) {
  const result = await get(paths(token).meta, { ...PRIVATE, useCache: false });
  if (!result || result.statusCode !== 200) return null;
  return JSON.parse(await new Response(result.stream).text());
}

export async function writeMeta(token, meta) {
  await put(paths(token).meta, JSON.stringify(meta, null, 2), META_PUT_OPTIONS);
  return meta;
}

/** Raw bytes of a blob, or null when it is not there. */
export async function readBytes(pathname) {
  const result = await get(pathname, PRIVATE);
  if (!result || result.statusCode !== 200) return null;
  return new Uint8Array(await new Response(result.stream).arrayBuffer());
}

export async function writePdf(pathname, bytes) {
  return put(pathname, bytes, PDF_PUT_OPTIONS);
}

export async function blobExists(pathname) {
  try {
    await head(pathname, PRIVATE);
    return true;
  } catch {
    return false;
  }
}

/**
 * Every proposal in the store, as `{ meta, has }` — `has` saying which of the
 * token's other blobs exist, taken from the same listing rather than a head()
 * per file.
 *
 * One listing plus one read per proposal. That is more work than an index
 * blob would be, but an index cannot be trusted here: the signing app writes
 * meta.json when a client signs and knows nothing about this project, so
 * anything cached on this side would show signed proposals as unsigned. Read
 * the records and the archive is right by construction.
 *
 * If this ever gets slow, the fix is a cache with a short TTL, not an index.
 */
export async function listProposals() {
  const byToken = new Map();

  let cursor;
  do {
    const page = await list({ prefix: PROPOSALS_PREFIX, cursor });
    for (const blob of page.blobs) {
      const token = tokenFromPath(blob.pathname);
      if (!token) continue;
      const entry = byToken.get(token) ?? new Set();
      entry.add(blob.pathname);
      byToken.set(token, entry);
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  const records = await Promise.all(
    [...byToken].map(async ([token, present]) => {
      const key = paths(token);
      // A folder without a readable record is not a proposal — a half-finished
      // upload, most likely. Skipped rather than surfaced as a broken row.
      const meta = await readMeta(token).catch(() => null);
      if (!meta) return null;

      return {
        meta,
        has: {
          original: present.has(key.original),
          signed: present.has(key.signed),
          docx: present.has(key.docx),
        },
      };
    }),
  );

  return records.filter(Boolean);
}

/**
 * The proposal-number counter, or null when it has never been written.
 *
 * Only a genuine absence may return null — that is what seeds the very first
 * proposal. A blob that exists but will not read has to throw, because
 * seeding on top of an existing store would re-issue numbers that are already
 * on documents with clients.
 */
export async function readCounter() {
  if (!(await blobExists(COUNTER_PATH))) return null;

  const result = await get(COUNTER_PATH, { ...PRIVATE, useCache: false });
  if (!result || result.statusCode !== 200) {
    throw new Error("Could not read the proposal id counter");
  }
  return JSON.parse(await new Response(result.stream).text());
}

export async function writeCounter(counter) {
  await put(COUNTER_PATH, JSON.stringify(counter, null, 2), COUNTER_PUT_OPTIONS);
  return counter;
}
