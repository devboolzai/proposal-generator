import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { randomBytes } from "node:crypto";

// ============================================================
// Filesystem primitives for the proposal store.
//
// Everything above this file speaks in store pathnames —
// `proposals/<token>/meta.json` — exactly as it did when those
// were Blob keys. This is the only place that knows they are
// now paths on a disk, and the only place that decides what is
// inside the store and what is not.
// ============================================================

/**
 * The store root. Read through a function rather than captured at import
 * time so tests can point it at a temp directory per case.
 */
export function storeRoot() {
  return resolve(process.env.PROPOSALS_DIR ?? "/var/lib/proposals");
}

/**
 * The absolute path for a store pathname.
 *
 * On Blob an odd pathname was just an odd key. On a filesystem it is
 * arbitrary read and write, so every path is resolved and then checked to be
 * under the root — a token that contains `..`, or an absolute path, dies
 * here. `isValidToken` already refuses those upstream; this is the backstop
 * that does not depend on every caller having remembered to ask.
 */
export function resolveInRoot(pathname) {
  if (typeof pathname !== "string" || pathname.length === 0) {
    throw new Error("Refusing to touch a path outside the store: empty path");
  }
  const root = storeRoot();
  const full = resolve(root, pathname);
  if (full !== root && !full.startsWith(root + sep)) {
    throw new Error(`Refusing to touch a path outside the store: ${pathname}`);
  }
  return full;
}

/** Contents of a store file, or null when it is not there. */
export async function readFileOrNull(pathname) {
  try {
    return await readFile(resolveInRoot(pathname));
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

/**
 * Write via a temp file in the same directory, then rename.
 *
 * rename() is atomic within a filesystem, so a reader sees either the old
 * file or the whole new one — never the half-written middle. A crash or a
 * full disk leaves the temp file, which is removed on the way out, and the
 * real file untouched. This is what makes a truncated meta.json impossible.
 */
export async function writeAtomic(pathname, data) {
  const full = resolveInRoot(pathname);
  await mkdir(dirname(full), { recursive: true });

  const tmp = `${full}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    const handle = await open(tmp, "wx");
    try {
      await handle.writeFile(data);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(tmp, full);
  } catch (err) {
    await rm(tmp, { force: true });
    throw err;
  }
}
