import { stat } from "node:fs/promises";
import { paths } from "../../../shared/proposal.js";
import { readFileOrNull, resolveInRoot, writeAtomic } from "../../../shared/fsStore.js";

// ============================================================
// Store I/O for this project.
//
// The shape of the data — paths, statuses, expiry — is defined
// once in shared/proposal.js. This file is only the wire: it
// exists per-project so this app can deploy from sign/ without
// reaching above its own root.
//
// Its twin is api/_lib/store.js at the repo root. Keep them in
// step. This side is a subset: the signing app never lists the
// store and never touches the counter.
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
