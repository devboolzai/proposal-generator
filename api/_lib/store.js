import { get, head, put } from "@vercel/blob";
import { META_PUT_OPTIONS, PDF_PUT_OPTIONS, PRIVATE, paths } from "../../shared/proposal.js";

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
