import { mkdir, open, rename, rm, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { STATUS, isValidToken, paths } from "../shared/proposal.js";
import { readMeta } from "./_lib/store.js";
import { resolveInRoot, syncDir } from "../shared/fsStore.js";
import { allowMethod, fail, httpError, requireAccessCode, sendJson } from "../shared/http.js";

// POST /api/proposal-upload?token=…&kind=pdf|docx&offset=…[&final=1]
//
// Step 2 of 3. Replaces the Vercel Blob client-upload dance: the browser
// sends the bytes here directly, since with our own nginx there is no 4.5MB
// body limit to route around.
//
// Chunked rather than one POST, because the file this carries is a
// page-per-JPEG raster of up to 30MB and the person sending it is usually on
// phone tethering. The client sends 5MB at a time and retries a chunk that
// fails, instead of restarting a 30MB upload.
//
// The offset is explicit, so a retried chunk overwrites exactly the bytes it
// wrote before rather than appending them twice. Bytes accumulate in a
// staging file; only `final=1` promotes it, so a half-finished upload never
// looks like a real document to proposal-ready.

const MAX_PDF_BYTES = 30 * 1024 * 1024;
// The Word file is text plus one cover JPEG — orders of magnitude under the
// raster it accompanies, so it gets its own, much tighter ceiling.
const MAX_DOCX_BYTES = 10 * 1024 * 1024;

export default async function handler(req, res) {
  if (!allowMethod(req, res, "POST")) return;
  if (!requireAccessCode(req, res)) return;

  try {
    const { token, kind, offset, final } = req.query;

    const target = uploadTarget(token, kind);
    const limit = target.kind === "docx" ? MAX_DOCX_BYTES : MAX_PDF_BYTES;

    const start = Number(offset);
    if (!Number.isInteger(start) || start < 0) {
      throw httpError(400, "נתיב העלאה לא חוקי");
    }
    if (start >= limit) {
      throw httpError(413, "הקובץ גדול מדי");
    }

    const meta = await readMeta(token);
    if (!meta) throw httpError(404, "ההצעה לא נמצאה");
    // Only a record still waiting for its documents may be written to. Once a
    // proposal is live — let alone signed — they are frozen.
    if (meta.status !== STATUS.PENDING) {
      throw httpError(409, "לא ניתן להעלות קובץ להצעה שכבר נשלחה");
    }

    const staging = resolveInRoot(`${target.pathname}.part`);
    await mkdir(dirname(staging), { recursive: true });

    const staged = await sizeOf(staging);

    // A final chunk whose response was lost in transit comes back after the
    // staging file has already been promoted. Writing it again would start a
    // fresh staging file with zeros where the earlier chunks were, and promote
    // that over the good document — so recognise the repeat and answer the
    // way the first attempt did.
    if (staged === null && start > 0 && final === "1") {
      const promoted = await sizeOf(resolveInRoot(target.pathname));
      const length = Number(req.headers["content-length"]);
      if (promoted !== null && promoted === start + length) {
        sendJson(res, 200, { pathname: target.pathname, size: promoted });
        return;
      }
    }

    // Chunks arrive in order, so a chunk may start where the staged bytes end,
    // or earlier when it is a retry. Anything further would leave a hole.
    if (start > (staged ?? 0)) {
      throw httpError(409, "ההעלאה נקטעה — יש לנסות לשלוח שוב");
    }

    const written = await writeChunkAt(req, staging, start, limit);

    if (final === "1") {
      await promote(staging, resolveInRoot(target.pathname));
      sendJson(res, 200, { pathname: target.pathname, size: start + written });
      return;
    }

    sendJson(res, 200, { received: written });
  } catch (err) {
    // A rejected upload must not leave staging bytes that a later, smaller
    // upload would inherit.
    if (err?.status === 413) await discard(req.query);
    fail(res, err);
  }
}

/**
 * The client names a `kind`, never a path. Two kinds are writable here: the
 * signable PDF and the archived Word original.
 *
 * `signed` is deliberately unreachable — only the signing app may write that,
 * and only from bytes it produced itself.
 */
export function uploadTarget(token, kind) {
  if (!isValidToken(token)) throw httpError(400, "נתיב העלאה לא חוקי");

  const key = paths(token);
  if (kind === "pdf") return { kind: "pdf", pathname: key.original };
  if (kind === "docx") return { kind: "docx", pathname: key.docx };

  throw httpError(400, "נתיב העלאה לא חוקי");
}

/**
 * Streams the request body into the staging file at `start`, refusing as soon
 * as the running total passes the ceiling rather than after the bytes have
 * landed.
 */
async function writeChunkAt(req, staging, start, limit) {
  const handle = await open(staging, "r+").catch(async (err) => {
    if (err.code !== "ENOENT") throw err;
    return open(staging, "w+");
  });

  let position = start;
  try {
    for await (const chunk of req) {
      if (position + chunk.length > limit) {
        throw httpError(413, "הקובץ גדול מדי");
      }
      await handle.write(chunk, 0, chunk.length, position);
      position += chunk.length;
    }
    await handle.sync();
  } finally {
    await handle.close();
  }

  return position - start;
}

async function promote(staging, final) {
  await rename(staging, final);
  await syncDir(dirname(final));
}

async function discard(query) {
  try {
    const target = uploadTarget(query?.token, query?.kind);
    await rm(resolveInRoot(`${target.pathname}.part`), { force: true });
  } catch {
    // Nothing to clean up, or a path we would refuse anyway.
  }
}

/** Size in bytes of the file at an absolute store path, or null when it is not there. */
async function sizeOf(full) {
  try {
    return (await stat(full)).size;
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}
