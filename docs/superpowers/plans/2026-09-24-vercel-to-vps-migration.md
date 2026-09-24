# Vercel → VPS Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `proposal-generator` and `proposal-sign` off Vercel onto the droplet at `46.101.139.175`, replacing Vercel Blob with a filesystem store, without losing a proposal or re-issuing a proposal number.

**Architecture:** Each app keeps its `api/*.js` handlers untouched and gains a ~60-line Node HTTP adapter that mounts them as routes. `api/_lib/store.js` swaps `@vercel/blob` for `node:fs/promises` against `/var/lib/proposals`, keeping its exported surface identical so no caller changes. nginx terminates TLS, serves `dist/` and proxies `/api/`. Two systemd services, two users, one shared data directory.

**Tech Stack:** Node 24 LTS, vitest, nginx, systemd, ufw, Cloudflare (proxy + Origin CA), rsync.

**Spec:** `docs/superpowers/specs/2026-09-24-vercel-to-vps-migration-design.md`

## Branch and deployment safety

**`main` is deployed to Vercel from GitHub and is live production. Do not commit to it, and do not push it, until the decommissioning section says so.**

- All work happens on the `migrate-to-vps` branch. Every task's commit lands there.
- The VPS is deployed from the **local working tree** by `scripts/deploy.sh` over rsync — not from GitHub. The branch therefore never needs to reach `main` for the droplet to run the new code. Git and deployment are decoupled on purpose; that is what keeps the Vercel rollback intact.
- Pushing `migrate-to-vps` to GitHub is safe for production but will trigger Vercel **preview** builds, which will fail once `@vercel/blob` is removed in Task 2. That failure is expected and harmless — it is a preview URL nobody uses. Push only if you want the backup; the work does not require it.
- Merging to `main` would deploy code with no `@vercel/blob` to the live Vercel project and break the rollback path. It happens **after** decommissioning, never before.

## Global Constraints

- Node 24 LTS on the server; ESM throughout (`"type": "module"`).
- `shared/` must stay free of npm dependencies — `node:` builtins only. Both apps deploy independently and `sign/` cannot see the root `node_modules`.
- `api/_lib/store.js` and `sign/api/_lib/store.js` stay separate twin files. Keep them in step.
- Every exported name in `store.js` keeps its current signature: `readMeta`, `writeMeta`, `readBytes`, `writePdf`, `blobExists`, `listProposals`, `findByProposalId`, `supersedeOthers`, `readCounter`, `writeCounter`.
- Store root comes from `PROPOSALS_DIR`, defaulting to `/var/lib/proposals`. Tests set it to a temp directory.
- Data paths are unchanged from Blob: `proposals/<token>/{meta.json,original.pdf,signed.pdf,proposal.docx}` and `counters/proposal-id.json`.
- Size caps unchanged: PDF 30MB (`30 * 1024 * 1024`), Word 10MB (`10 * 1024 * 1024`).
- Upload chunk size: 5MB (`5 * 1024 * 1024`).
- Ports: generator `127.0.0.1:3000`, signing app `127.0.0.1:3001`. Never bind `0.0.0.0`.
- Hostnames: `quote.boolzai.co.il` (generator), `sign.boolzai.co.il` (signing app).
- Hebrew user-facing error strings are preserved exactly as written today.
- Run `npm test` from the repo root; tests are vitest.

## Review Focus

1. **Path traversal through a token.** On Blob a malicious pathname was a strange key; on a filesystem it is arbitrary read/write. Every path must resolve inside the store root or throw. — Task 1
2. **Concurrent proposal-id allocation.** Two overlapping allocations must never receive the same number; this is the one irreversible failure in the system. — Task 3
3. **Chunk upload abuse.** A retried chunk at the same offset must be idempotent; a chunk beyond the size cap must be refused mid-stream, not after the bytes have landed. — Task 5
4. **Writing to a forbidden target.** `signed.pdf` must remain unwritable by the generator, and no upload may touch a record that has left `pending`. — Task 5
5. **Truncated records.** A crash or full disk mid-write must never leave a readable-but-truncated `meta.json`. — Task 1

---

## File Structure

**Created:**
- `api/_lib/fsStore.js` — path resolution and atomic write primitives, shared by the generator's store
- `sign/api/_lib/fsStore.js` — its twin
- `api/proposal-upload.js` — chunked upload endpoint
- `server.js` — generator HTTP adapter
- `sign/server.js` — signing app HTTP adapter
- `lib/routes.js` — route loading + body/query parsing, imported by both adapters
- `scripts/migrate-blob-to-fs.js` — one-off Blob → local tree migration
- `scripts/deploy.sh` — build, rsync, symlink, restart
- `deploy/bootstrap.sh` — droplet provisioning
- `deploy/nginx/{quote,sign}.boolzai.co.il.conf`
- `deploy/systemd/proposal-{gen,sign}.service`
- `deploy/backup.sh`
- `docs/runbook-cutover.md`

**Modified:**
- `api/_lib/store.js`, `sign/api/_lib/store.js` — filesystem internals
- `api/_lib/proposalId.js` — locking
- `shared/proposal.js` — drop Blob option constants
- `shared/http.js` — `readBody`
- `src/share/createSignLink.js` — chunked upload
- `package.json`, `sign/package.json`, `vite.config.js`, `sign/vite.config.js`, `README.md`

**Deleted:**
- `api/blob-upload.js`, `api/blob-upload.test.js`

---

## Task 1: Filesystem store for the generator

**Files:**
- Create: `api/_lib/fsStore.js`
- Modify: `api/_lib/store.js` (full rewrite of internals)
- Test: `api/_lib/store.test.js`

**Interfaces:**
- Consumes: `shared/proposal.js` — `paths`, `isValidToken`, `PROPOSALS_PREFIX`, `COUNTER_PATH`, `tokenFromPath`, `isSupersededBy`, `supersede`
- Produces: `api/_lib/fsStore.js` exports `storeRoot(): string`, `resolveInRoot(pathname: string): string`, `writeAtomic(pathname: string, data: Buffer|string): Promise<void>`, `readFileOrNull(pathname: string): Promise<Buffer|null>`. `api/_lib/store.js` keeps every name listed in Global Constraints with unchanged signatures.

- [ ] **Step 1: Write the failing test**

Create `api/_lib/store.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, readdir, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let dir;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "proposals-"));
  process.env.PROPOSALS_DIR = dir;
  vi.resetModules();
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function store() {
  return import("./store.js");
}

describe("readMeta", () => {
  it("returns null when the token names nothing", async () => {
    const { readMeta } = await store();
    expect(await readMeta("a".repeat(32))).toBeNull();
  });

  it("round-trips a record through writeMeta", async () => {
    const { readMeta, writeMeta } = await store();
    const token = "b".repeat(32);
    await writeMeta(token, { token, proposalId: 50001 });
    expect(await readMeta(token)).toEqual({ token, proposalId: 50001 });
  });
});

describe("path safety", () => {
  it("refuses a pathname that escapes the store root", async () => {
    const { readBytes } = await store();
    await expect(readBytes("../../etc/passwd")).rejects.toThrow(/outside the store/);
  });

  it("refuses an absolute pathname", async () => {
    const { readBytes } = await store();
    await expect(readBytes("/etc/passwd")).rejects.toThrow(/outside the store/);
  });
});

describe("writeMeta", () => {
  it("leaves no temp file behind", async () => {
    const { writeMeta } = await store();
    const token = "c".repeat(32);
    await writeMeta(token, { token });
    const files = await readdir(join(dir, "proposals", token));
    expect(files).toEqual(["meta.json"]);
  });

  it("replaces a record without ever exposing a partial one", async () => {
    // rename() is the whole point: a reader sees the old file or the new
    // one, never a half-written middle.
    const { writeMeta, readMeta } = await store();
    const token = "g".repeat(32);
    await writeMeta(token, { token, status: "pending" });
    await writeMeta(token, { token, status: "sent" });
    expect(await readMeta(token)).toEqual({ token, status: "sent" });
    const files = await readdir(join(dir, "proposals", token));
    expect(files).toEqual(["meta.json"]);
  });
});

describe("listProposals", () => {
  it("returns [] when the store has never been written", async () => {
    const { listProposals } = await store();
    expect(await listProposals()).toEqual([]);
  });

  it("skips a folder whose record is unreadable", async () => {
    const { listProposals, writeMeta } = await store();
    const good = "d".repeat(32);
    const bad = "e".repeat(32);
    await writeMeta(good, { token: good, proposalId: 50001 });
    await mkdir(join(dir, "proposals", bad), { recursive: true });
    await writeFile(join(dir, "proposals", bad, "meta.json"), "{ not json");
    const rows = await listProposals();
    expect(rows).toHaveLength(1);
    expect(rows[0].meta.token).toBe(good);
  });

  it("reports which files are present", async () => {
    const { listProposals, writeMeta, writePdf } = await store();
    const token = "f".repeat(32);
    await writeMeta(token, { token, proposalId: 50002 });
    await writePdf(`proposals/${token}/original.pdf`, new Uint8Array([1, 2, 3]));
    const [row] = await listProposals();
    expect(row.has).toEqual({ original: true, signed: false, docx: false });
  });
});

describe("readCounter", () => {
  it("returns null only when the counter has never been written", async () => {
    const { readCounter } = await store();
    expect(await readCounter()).toBeNull();
  });

  it("throws rather than reseeding when the counter is corrupt", async () => {
    const { readCounter } = await store();
    await mkdir(join(dir, "counters"), { recursive: true });
    await writeFile(join(dir, "counters", "proposal-id.json"), "{ not json");
    await expect(readCounter()).rejects.toThrow();
  });
});
```

Add `vi` to the vitest import: `import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";`

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- api/_lib/store.test.js`
Expected: FAIL — the store still imports `@vercel/blob` and ignores `PROPOSALS_DIR`.

- [ ] **Step 3: Write the path primitives**

Create `api/_lib/fsStore.js`:

```js
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
```

- [ ] **Step 4: Rewrite the store internals**

Replace `api/_lib/store.js` in full:

```js
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
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- api/_lib/store.test.js`
Expected: PASS, all cases.

- [ ] **Step 6: Commit**

```bash
git add api/_lib/fsStore.js api/_lib/store.js api/_lib/store.test.js
git commit -m "feat: filesystem store for the generator, replacing Vercel Blob"
```

---

## Task 2: Filesystem store for the signing app, and drop the Blob constants

**Files:**
- Create: `sign/api/_lib/fsStore.js`
- Modify: `sign/api/_lib/store.js`, `shared/proposal.js`
- Test: `sign/api/_lib/store.test.js`

**Interfaces:**
- Consumes: the same `shared/proposal.js` exports as Task 1, minus the removed constants
- Produces: `sign/api/_lib/store.js` exporting `readMeta`, `writeMeta`, `readBytes`, `writePdf`, `blobExists` with unchanged signatures

The signing app's store is a strict subset of the generator's — it never lists, never touches the counter.

- [ ] **Step 1: Write the failing test**

Create `sign/api/_lib/store.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let dir;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "proposals-sign-"));
  process.env.PROPOSALS_DIR = dir;
  vi.resetModules();
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const store = () => import("./store.js");

describe("the signing app's store", () => {
  it("round-trips a record", async () => {
    const { readMeta, writeMeta } = await store();
    const token = "a".repeat(32);
    await writeMeta(token, { token, status: "sent" });
    expect(await readMeta(token)).toEqual({ token, status: "sent" });
  });

  it("writes and reads the signed pdf", async () => {
    const { writePdf, readBytes, blobExists } = await store();
    const token = "b".repeat(32);
    const path = `proposals/${token}/signed.pdf`;
    await writePdf(path, new Uint8Array([37, 80, 68, 70]));
    expect(await blobExists(path)).toBe(true);
    expect(Array.from(await readBytes(path))).toEqual([37, 80, 68, 70]);
  });

  it("refuses a path outside the store", async () => {
    const { readBytes } = await store();
    await expect(readBytes("../../etc/passwd")).rejects.toThrow(/outside the store/);
  });

  it("sees a record written by the generator's store", async () => {
    // The shared directory is the only coupling between the two apps; if this
    // breaks, a client can sign a proposal the generator cannot see.
    const token = "c".repeat(32);
    const generator = await import("../../../api/_lib/store.js");
    await generator.writeMeta(token, { token, status: "sent" });
    const { readMeta } = await store();
    expect(await readMeta(token)).toEqual({ token, status: "sent" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- sign/api/_lib/store.test.js`
Expected: FAIL — `sign/api/_lib/store.js` still imports `@vercel/blob`.

- [ ] **Step 3: Create the twin primitives**

Copy `api/_lib/fsStore.js` to `sign/api/_lib/fsStore.js` verbatim. It has no relative imports, so it needs no edits. The duplication is deliberate and matches the existing twin-file arrangement: `sign/` deploys without seeing the repo root.

- [ ] **Step 4: Rewrite the signing app's store**

Replace `sign/api/_lib/store.js`:

```js
import { stat } from "node:fs/promises";
import { paths } from "../../../shared/proposal.js";
import { readFileOrNull, resolveInRoot, writeAtomic } from "./fsStore.js";

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
```

- [ ] **Step 5: Remove the Blob option constants**

In `shared/proposal.js`, delete the `PRIVATE`, `META_PUT_OPTIONS`, `PDF_PUT_OPTIONS`, `DOCX_PUT_OPTIONS` and `COUNTER_PUT_OPTIONS` exports and the `// ---------- Blob options ----------` heading. **Keep `DOCX_CONTENT_TYPE`** — it is still needed for HTTP response headers.

Replace the deleted block with:

```js
// ---------- content types ----------

/**
 * The Word original is stored alongside the PDF, so that the archive can hand
 * back an editable document and not only a raster.
 */
export const DOCX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
```

- [ ] **Step 6: Verify nothing still imports the removed constants**

Run: `grep -rn "PUT_OPTIONS\|PRIVATE" api sign/api shared src sign/src --include=*.js --include=*.jsx`
Expected: no matches. If any appear, remove the import and the usage.

- [ ] **Step 7: Run the whole suite**

Run: `npm test`
Expected: PASS. `shared/proposal.test.js` must still pass untouched.

- [ ] **Step 8: Commit**

```bash
git add sign/api/_lib/fsStore.js sign/api/_lib/store.js sign/api/_lib/store.test.js shared/proposal.js
git commit -m "feat: filesystem store for the signing app; drop Blob-only constants"
```

---

## Task 3: Make proposal-number allocation atomic

**Files:**
- Modify: `api/_lib/proposalId.js`
- Test: `api/_lib/proposalId.test.js`

**Interfaces:**
- Consumes: `takeProposalId` from `shared/proposal.js`; `readCounter`, `writeCounter` from `./store.js`
- Produces: `allocateProposalId(): Promise<number>` — unchanged signature, now safe under concurrency

The README documents that two simultaneous allocations get the same number because Blob has no compare-and-swap. A filesystem has `O_EXCL`, so the hole closes.

- [ ] **Step 1: Write the failing test**

Create `api/_lib/proposalId.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let dir;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "proposals-counter-"));
  process.env.PROPOSALS_DIR = dir;
  vi.resetModules();
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const lib = () => import("./proposalId.js");

describe("allocateProposalId", () => {
  it("seeds at 50001 on an empty store", async () => {
    const { allocateProposalId } = await lib();
    expect(await allocateProposalId()).toBe(50001);
  });

  it("hands out consecutive numbers", async () => {
    const { allocateProposalId } = await lib();
    expect(await allocateProposalId()).toBe(50001);
    expect(await allocateProposalId()).toBe(50002);
    expect(await allocateProposalId()).toBe(50003);
  });

  it("never issues the same number twice under concurrency", async () => {
    // This is the whole point of the task. On Blob this test would fail.
    const { allocateProposalId } = await lib();
    const ids = await Promise.all(
      Array.from({ length: 25 }, () => allocateProposalId()),
    );
    expect(new Set(ids).size).toBe(25);
    expect([...ids].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 25 }, (_, i) => 50001 + i),
    );
  });

  it("refuses to allocate from a corrupt counter rather than reseeding", async () => {
    const { allocateProposalId } = await lib();
    await mkdir(join(dir, "counters"), { recursive: true });
    await writeFile(join(dir, "counters", "proposal-id.json"), "{ not json");
    await expect(allocateProposalId()).rejects.toThrow();
  });

  it("keeps working after a failed allocation", async () => {
    // A throw must not leave the lock held or the queue wedged.
    const { allocateProposalId } = await lib();
    await mkdir(join(dir, "counters"), { recursive: true });
    await writeFile(join(dir, "counters", "proposal-id.json"), "{ not json");
    await expect(allocateProposalId()).rejects.toThrow();

    await writeFile(
      join(dir, "counters", "proposal-id.json"),
      JSON.stringify({ next: 50010 }),
    );
    expect(await allocateProposalId()).toBe(50010);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- api/_lib/proposalId.test.js`
Expected: FAIL on the concurrency case — 25 overlapping reads all see the same counter and return duplicates.

- [ ] **Step 3: Implement the lock**

Replace `api/_lib/proposalId.js`:

```js
import { open, rm, stat } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { COUNTER_PATH, takeProposalId } from "../../shared/proposal.js";
import { readCounter, writeCounter } from "./store.js";
import { resolveInRoot } from "./fsStore.js";

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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- api/_lib/proposalId.test.js`
Expected: PASS, including the 25-way concurrency case.

- [ ] **Step 5: Update the README's warning about non-atomic allocation**

In `README.md`, find the paragraph beginning `הקצאה שלא הבשילה להצעה שנשלחה` and replace the sentence stating that two simultaneous allocations receive the same number. Keep the gap-in-the-sequence explanation, which is still true. New wording for the second half:

```
הקצאה שלא הבשילה להצעה שנשלחה משאירה חור ברצף — זה תקין ומצופה. ההקצאה עצמה
אטומית: היא מוגנת בתור פנים-תהליכי ובנעילת קובץ, ולכן שתי הקצאות בו-זמניות
יקבלו שני מספרים שונים.
```

- [ ] **Step 6: Commit**

```bash
git add api/_lib/proposalId.js api/_lib/proposalId.test.js README.md
git commit -m "fix: make proposal-number allocation atomic with a queue and lockfile"
```

---

## Task 4: HTTP adapter for the generator

**Files:**
- Create: `lib/routes.js`, `server.js`
- Modify: `shared/http.js:readBody`
- Test: `lib/routes.test.js`

**Interfaces:**
- Consumes: `api/*.js` default exports, `shared/http.js` — `sendJson`
- Produces: `lib/routes.js` exports `loadRoutes(apiDir: string): Promise<Map<string, Handler>>` and `createApp(routes: Map<string, Handler>): http.Server`. A `Handler` is `(req, res) => Promise<void>` where `req.query` is a plain object of search params and `req.body` is the parsed JSON body (or `undefined`).

Vercel supplied `req.query` and a parsed `req.body`. Three handlers already read `req.query` (`api/proposal-file.js:48`, `sign/api/proposal-get.js:16`, `sign/api/proposal-pdf.js:25`), so the adapter must provide both.

- [ ] **Step 1: Write the failing test**

Create `lib/routes.test.js`:

```js
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createApp } from "./routes.js";

let server;
let base;

const routes = new Map([
  [
    "/api/echo",
    async (req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ query: req.query, body: req.body ?? null }));
    },
  ],
  [
    "/api/boom",
    async () => {
      throw new Error("handler exploded");
    },
  ],
]);

beforeAll(async () => {
  server = createApp(routes);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => new Promise((resolve) => server.close(resolve)));

describe("createApp", () => {
  it("exposes search params as req.query", async () => {
    const res = await fetch(`${base}/api/echo?token=abc&kind=signed`);
    expect(await res.json()).toEqual({
      query: { token: "abc", kind: "signed" },
      body: null,
    });
  });

  it("parses a JSON body into req.body", async () => {
    const res = await fetch(`${base}/api/echo`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "xyz" }),
    });
    expect((await res.json()).body).toEqual({ token: "xyz" });
  });

  it("leaves req.body undefined when no body was sent", async () => {
    const res = await fetch(`${base}/api/echo`, { method: "POST" });
    expect((await res.json()).body).toBeNull();
  });

  it("answers 400 on a malformed JSON body rather than 500", async () => {
    const res = await fetch(`${base}/api/echo`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{ not json",
    });
    expect(res.status).toBe(400);
  });

  it("answers 404 for an unknown route", async () => {
    const res = await fetch(`${base}/api/nope`);
    expect(res.status).toBe(404);
  });

  it("answers 500 when a handler throws, without crashing the process", async () => {
    const res = await fetch(`${base}/api/boom`);
    expect(res.status).toBe(500);
    // still serving
    expect((await fetch(`${base}/api/echo`)).status).toBe(200);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- lib/routes.test.js`
Expected: FAIL — `lib/routes.js` does not exist.

- [ ] **Step 3: Write the adapter**

Create `lib/routes.js`:

```js
import { createServer } from "node:http";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { sendJson } from "../shared/http.js";

// ============================================================
// What Vercel used to do for us.
//
// Each api/<name>.js becomes POST/GET /api/<name>, keeping the
// file-per-route convention the handlers were written against,
// so they move across untouched. The only two things Vercel
// supplied that the handlers actually read are req.query and a
// parsed req.body — both are filled in here.
//
// Routes are loaded once at boot. A handler that fails to
// import should crash the process at startup, loudly, rather
// than 404 quietly under traffic.
// ============================================================

/** A JSON body larger than this is a mistake or an attack; uploads do not come through here. */
const MAX_JSON_BYTES = 1024 * 1024;

export async function loadRoutes(apiDir) {
  const entries = await readdir(apiDir, { withFileTypes: true });
  const routes = new Map();

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".js")) continue;
    // _lib/ is not routable, and neither are the tests sitting beside the
    // handlers.
    if (entry.name.startsWith("_") || entry.name.includes(".test.")) continue;

    const mod = await import(pathToFileURL(join(apiDir, entry.name)).href);
    if (typeof mod.default !== "function") continue;

    routes.set(`/api/${entry.name.slice(0, -3)}`, mod.default);
  }

  return routes;
}

export function createApp(routes) {
  return createServer((req, res) => {
    handle(routes, req, res).catch((err) => {
      console.error(err);
      if (!res.headersSent) sendJson(res, 500, { error: "אירעה שגיאה" });
      else res.end();
    });
  });
}

async function handle(routes, req, res) {
  const url = new URL(req.url, "http://localhost");
  req.query = Object.fromEntries(url.searchParams);

  const handler = routes.get(url.pathname);
  if (!handler) {
    sendJson(res, 404, { error: "Not found" });
    return;
  }

  // Only JSON is parsed here. The upload route reads its own raw stream, and
  // consuming it would leave it nothing to read.
  const type = req.headers["content-type"] ?? "";
  if (/^application\/json/i.test(type)) {
    let raw;
    try {
      raw = await readRaw(req, MAX_JSON_BYTES);
    } catch {
      sendJson(res, 413, { error: "Body too large" });
      return;
    }
    if (raw.length > 0) {
      try {
        req.body = JSON.parse(raw.toString("utf8"));
      } catch {
        sendJson(res, 400, { error: "Malformed JSON body" });
        return;
      }
    }
  }

  await handler(req, res);
}

async function readRaw(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error("too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
```

- [ ] **Step 4: Simplify `readBody`**

In `shared/http.js`, replace the `readBody` docblock and body:

```js
/**
 * Routes never see a raw string. The HTTP adapter parses JSON bodies onto
 * req.body before a handler runs; this keeps the older string case working so
 * a handler called directly from a test can pass either shape.
 */
export function readBody(req) {
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body ?? {};
}
```

- [ ] **Step 5: Write the entrypoint**

Create `server.js`:

```js
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp, loadRoutes } from "./lib/routes.js";

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT ?? 3000);

const here = dirname(fileURLToPath(import.meta.url));
const routes = await loadRoutes(join(here, "api"));

createApp(routes).listen(PORT, HOST, () => {
  console.log(`proposal-generator listening on ${HOST}:${PORT}`);
  console.log(`routes: ${[...routes.keys()].sort().join(", ")}`);
});
```

- [ ] **Step 6: Run the tests**

Run: `npm test -- lib/routes.test.js`
Expected: PASS.

- [ ] **Step 7: Smoke-test the real server**

Run:
```bash
PROPOSALS_DIR=/tmp/proposals-smoke APP_ACCESS_CODE=test SIGN_BASE_URL=http://localhost:3001 node server.js
```
Expected: it prints the listening line and a route list containing `/api/proposal-create`, `/api/proposal-id`, `/api/proposal-file`, `/api/proposal-ready`, `/api/proposal-send-link`, `/api/proposals-list`.

In another shell:
```bash
curl -s -XPOST -H 'x-app-code: test' http://127.0.0.1:3000/api/proposal-id
```
Expected: `{"proposalId":50001}`. Then stop the server and `rm -rf /tmp/proposals-smoke`.

- [ ] **Step 8: Commit**

```bash
git add lib/routes.js lib/routes.test.js server.js shared/http.js
git commit -m "feat: HTTP adapter mounting api/ handlers, replacing Vercel routing"
```

---

## Task 5: Chunked upload endpoint

**Files:**
- Create: `api/proposal-upload.js`
- Delete: `api/blob-upload.js`, `api/blob-upload.test.js`
- Test: `api/proposal-upload.test.js`

**Interfaces:**
- Consumes: `readMeta` from `./_lib/store.js`; `resolveInRoot`, `writeAtomic` from `./_lib/fsStore.js`; `paths`, `isValidToken`, `STATUS`, `DOCX_CONTENT_TYPE` from `shared/proposal.js`
- Produces: route `POST /api/proposal-upload?token=&kind=pdf|docx&offset=<n>[&final=1]`, returning `{ received: number }` per chunk and `{ pathname, size }` on the final chunk. Exports `uploadTarget(token, kind)` for its tests.

This replaces `@vercel/blob/client`'s `multipart: true`, which existed because a 30MB raster is routinely uploaded over phone tethering. Explicit offsets make a retried chunk idempotent.

The rules carried over from `api/blob-upload.js` — and which its deleted tests covered — are: the client never names a path, only `kind`; `signed.pdf` is unreachable because only the signing app may write it; and a record that has left `pending` is frozen.

- [ ] **Step 1: Write the failing test**

Create `api/proposal-upload.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../lib/routes.js";

let dir;
let server;
let base;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "proposals-upload-"));
  process.env.PROPOSALS_DIR = dir;
  process.env.APP_ACCESS_CODE = "test-code";
  vi.resetModules();

  const { default: handler } = await import("./proposal-upload.js");
  server = createApp(new Map([["/api/proposal-upload", handler]]));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}/api/proposal-upload`;
});

afterEach(async () => {
  await new Promise((r) => server.close(r));
  await rm(dir, { recursive: true, force: true });
});

const TOKEN = "a".repeat(32);

async function seedPending(status = "pending") {
  const { writeMeta } = await import("./_lib/store.js");
  await writeMeta(TOKEN, { token: TOKEN, proposalId: 50001, status });
}

function send(query, body, code = "test-code") {
  return fetch(`${base}?${new URLSearchParams(query)}`, {
    method: "POST",
    headers: { "content-type": "application/octet-stream", "x-app-code": code },
    body,
  });
}

describe("proposal-upload", () => {
  it("refuses without the access code", async () => {
    await seedPending();
    const res = await send({ token: TOKEN, kind: "pdf", offset: "0" }, "x", "wrong");
    expect(res.status).toBe(401);
  });

  it("assembles chunks in order into the final file", async () => {
    await seedPending();
    await send({ token: TOKEN, kind: "pdf", offset: "0" }, "hello ");
    const res = await send(
      { token: TOKEN, kind: "pdf", offset: "6", final: "1" },
      "world",
    );
    expect(res.status).toBe(200);
    const file = await readFile(join(dir, "proposals", TOKEN, "original.pdf"));
    expect(file.toString()).toBe("hello world");
  });

  it("is idempotent when a chunk is retried at the same offset", async () => {
    await seedPending();
    await send({ token: TOKEN, kind: "pdf", offset: "0" }, "hello ");
    await send({ token: TOKEN, kind: "pdf", offset: "0" }, "hello ");
    await send({ token: TOKEN, kind: "pdf", offset: "6", final: "1" }, "world");
    const file = await readFile(join(dir, "proposals", TOKEN, "original.pdf"));
    expect(file.toString()).toBe("hello world");
  });

  it("writes nothing until the final chunk arrives", async () => {
    await seedPending();
    await send({ token: TOKEN, kind: "pdf", offset: "0" }, "partial");
    const { blobExists } = await import("./_lib/store.js");
    expect(await blobExists(`proposals/${TOKEN}/original.pdf`)).toBe(false);
  });

  it("refuses a record that has left pending", async () => {
    await seedPending("sent");
    const res = await send({ token: TOKEN, kind: "pdf", offset: "0" }, "x");
    expect(res.status).toBe(409);
  });

  it("refuses an unknown token", async () => {
    const res = await send({ token: "b".repeat(32), kind: "pdf", offset: "0" }, "x");
    expect(res.status).toBe(404);
  });

  it("refuses a traversal token", async () => {
    await seedPending();
    const res = await send({ token: "../../etc", kind: "pdf", offset: "0" }, "x");
    expect(res.status).toBe(400);
  });

  it("refuses kind=signed — only the signing app writes that", async () => {
    await seedPending();
    const res = await send({ token: TOKEN, kind: "signed", offset: "0" }, "x");
    expect(res.status).toBe(400);
  });

  it("refuses a chunk that would exceed the pdf cap", async () => {
    await seedPending();
    const res = await send(
      { token: TOKEN, kind: "pdf", offset: String(30 * 1024 * 1024) },
      "one byte too many",
    );
    expect(res.status).toBe(413);
  });

  it("stops reading a stream that grows past the cap", async () => {
    await seedPending();
    const big = Buffer.alloc(11 * 1024 * 1024);
    const res = await send({ token: TOKEN, kind: "docx", offset: "0" }, big);
    expect(res.status).toBe(413);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- api/proposal-upload.test.js`
Expected: FAIL — `api/proposal-upload.js` does not exist.

- [ ] **Step 3: Write the handler**

Create `api/proposal-upload.js`:

```js
import { mkdir, open, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { STATUS, isValidToken, paths } from "../shared/proposal.js";
import { readMeta } from "./_lib/store.js";
import { resolveInRoot } from "./_lib/fsStore.js";
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
    fail(res, err, 400);
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
}

async function discard(query) {
  try {
    const target = uploadTarget(query?.token, query?.kind);
    await rm(resolveInRoot(`${target.pathname}.part`), { force: true });
  } catch {
    // Nothing to clean up, or a path we would refuse anyway.
  }
}
```

- [ ] **Step 4: Delete the Blob upload route and its test**

```bash
git rm api/blob-upload.js api/blob-upload.test.js
```

- [ ] **Step 5: Run the tests**

Run: `npm test -- api/proposal-upload.test.js`
Expected: PASS, all eleven cases.

- [ ] **Step 6: Commit**

```bash
git add api/proposal-upload.js api/proposal-upload.test.js
git commit -m "feat: chunked upload endpoint, replacing Vercel Blob client upload"
```

---

## Task 6: Client-side chunked upload

**Files:**
- Modify: `src/share/createSignLink.js`
- Test: `src/share/uploadChunked.test.js`
- Create: `src/share/uploadChunked.js`

**Interfaces:**
- Consumes: `POST /api/proposal-upload` from Task 5
- Produces: `uploadChunked({ blob, token, kind, accessCode, onProgress })` — resolves when the final chunk is acknowledged, throws `ApiError` otherwise

- [ ] **Step 1: Write the failing test**

Create `src/share/uploadChunked.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from "vitest";
import { uploadChunked } from "./uploadChunked.js";

beforeEach(() => {
  vi.restoreAllMocks();
});

function blobOf(size) {
  return new Blob([new Uint8Array(size)]);
}

describe("uploadChunked", () => {
  it("sends one request for a blob smaller than a chunk, marked final", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    await uploadChunked({ blob: blobOf(100), token: "t", kind: "pdf", accessCode: "c" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(fetchMock.mock.calls[0][0], "http://x");
    expect(url.searchParams.get("offset")).toBe("0");
    expect(url.searchParams.get("final")).toBe("1");
  });

  it("splits a large blob and marks only the last chunk final", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    const chunk = 5 * 1024 * 1024;
    await uploadChunked({ blob: blobOf(chunk * 2 + 10), token: "t", kind: "pdf", accessCode: "c" });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const finals = fetchMock.mock.calls.map(
      ([u]) => new URL(u, "http://x").searchParams.get("final"),
    );
    expect(finals).toEqual([null, null, "1"]);
  });

  it("retries a failed chunk at the same offset rather than restarting", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    await uploadChunked({ blob: blobOf(100), token: "t", kind: "pdf", accessCode: "c" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const offsets = fetchMock.mock.calls.map(
      ([u]) => new URL(u, "http://x").searchParams.get("offset"),
    );
    expect(offsets).toEqual(["0", "0"]);
  });

  it("gives up after the retry budget and throws", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      uploadChunked({ blob: blobOf(100), token: "t", kind: "pdf", accessCode: "c" }),
    ).rejects.toThrow(/העלאת הקובץ נכשלה/);
  });

  it("does not retry a refusal the server will repeat", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: "לא ניתן להעלות קובץ להצעה שכבר נשלחה" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      uploadChunked({ blob: blobOf(100), token: "t", kind: "pdf", accessCode: "c" }),
    ).rejects.toThrow(/כבר נשלחה/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/share/uploadChunked.test.js`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write the uploader**

Create `src/share/uploadChunked.js`:

```js
import { ApiError } from "./api";

// ============================================================
// Sends a Blob to /api/proposal-upload in pieces.
//
// The file is a page-per-JPEG raster of up to 30MB and the
// salesperson sending it is usually tethered to a phone. One
// long POST on that connection fails often, and when it fails it
// loses everything. Chunks fail small and retry small.
//
// The server writes each chunk at the offset named in the query
// string, so a retry rewrites the same bytes instead of
// appending them a second time — which is what makes retrying
// safe rather than corrupting.
// ============================================================

const CHUNK_BYTES = 5 * 1024 * 1024;
const ATTEMPTS_PER_CHUNK = 4;
const BACKOFF_MS = 800;

/** Statuses the server will answer the same way however many times we ask. */
const FINAL_STATUSES = new Set([400, 401, 404, 409, 413]);

export async function uploadChunked({ blob, token, kind, accessCode, onProgress }) {
  const total = blob.size;

  for (let offset = 0; offset < total || offset === 0; offset += CHUNK_BYTES) {
    const end = Math.min(offset + CHUNK_BYTES, total);
    const isFinal = end >= total;

    await sendChunk({
      slice: blob.slice(offset, end),
      offset,
      isFinal,
      token,
      kind,
      accessCode,
    });

    onProgress?.(Math.round((end / Math.max(total, 1)) * 100));
    if (isFinal) return;
  }
}

async function sendChunk({ slice, offset, isFinal, token, kind, accessCode }) {
  const params = new URLSearchParams({ token, kind, offset: String(offset) });
  if (isFinal) params.set("final", "1");
  const url = `/api/proposal-upload?${params}`;

  let lastError;

  for (let attempt = 0; attempt < ATTEMPTS_PER_CHUNK; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/octet-stream",
          "x-app-code": accessCode,
        },
        body: slice,
      });

      if (response.ok) return;

      const payload = await response.json().catch(() => ({}));
      const error = new ApiError(payload.error || "העלאת הקובץ נכשלה", response.status);

      // A 409 or a 413 means the same thing next time. Only a transport
      // failure or a 5xx is worth asking again.
      if (FINAL_STATUSES.has(response.status)) throw error;
      lastError = error;
    } catch (err) {
      if (err instanceof ApiError && FINAL_STATUSES.has(err.status)) throw err;
      lastError = err;
    }

    await new Promise((resolve) => setTimeout(resolve, BACKOFF_MS * (attempt + 1)));
  }

  throw new ApiError(lastError?.message || "העלאת הקובץ נכשלה", 0);
}
```

- [ ] **Step 4: Rewire `createSignLink`**

In `src/share/createSignLink.js`:

Replace line 1 (`import { upload } from "@vercel/blob/client";`) with:

```js
import { uploadChunked } from "./uploadChunked";
```

Replace the PDF upload block:

```js
  onProgress("מעלה את ההצעה…");
  try {
    await uploadChunked({
      blob,
      token,
      kind: "pdf",
      accessCode,
      onProgress: (pct) => onProgress(`מעלה את ההצעה… ${pct}%`),
    });
  } catch (err) {
    throw new ApiError(err?.message || "העלאת הקובץ נכשלה", 0);
  }
```

Replace the Word upload block, keeping its existing comment and its never-fatal behaviour:

```js
  if (sections && docxPathname) {
    onProgress("מעלה עותק Word…");
    try {
      const { blob: docxBlob } = await generateDocx(
        proposalData,
        sections,
        notes ?? [],
        proposalId,
        { returnBlob: true },
      );
      await uploadChunked({ blob: docxBlob, token, kind: "docx", accessCode });
    } catch (err) {
      console.error("docx archive upload failed", err);
    }
  }
```

`pathname` and `docxPathname` are no longer needed from `/api/proposal-create` — the client names a `kind`, not a path. Narrow the destructure to `const { token } = await postJson(...)` and drop the `if (sections && docxPathname)` guard down to `if (sections)`. Remove the now-unused `DOCX_CONTENT_TYPE` mirror constant near line 26 if nothing else references it.

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Verify no Blob imports survive in the client**

Run: `grep -rn "@vercel/blob" src sign/src api sign/api`
Expected: no matches.

- [ ] **Step 7: Commit**

```bash
git add src/share/uploadChunked.js src/share/uploadChunked.test.js src/share/createSignLink.js
git commit -m "feat: chunked client upload with per-chunk retry"
```

---

## Task 7: Signing app adapter, dev proxies, dependency cleanup, README

**Files:**
- Create: `sign/lib/routes.js`, `sign/server.js`
- Modify: `vite.config.js`, `sign/vite.config.js`, `package.json`, `sign/package.json`, `README.md`

**Interfaces:**
- Consumes: `lib/routes.js` from Task 4 (copied, for the same reason the stores are twins)
- Produces: signing app listening on `127.0.0.1:3001`

- [ ] **Step 1: Copy the adapter into the signing app**

Copy `lib/routes.js` to `sign/lib/routes.js`. Change its one relative import to match the signing app's depth:

```js
import { sendJson } from "../../shared/http.js";
```

- [ ] **Step 2: Write the signing app entrypoint**

Create `sign/server.js`:

```js
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp, loadRoutes } from "./lib/routes.js";

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT ?? 3001);

const here = dirname(fileURLToPath(import.meta.url));
const routes = await loadRoutes(join(here, "api"));

createApp(routes).listen(PORT, HOST, () => {
  console.log(`proposal-sign listening on ${HOST}:${PORT}`);
  console.log(`routes: ${[...routes.keys()].sort().join(", ")}`);
});
```

- [ ] **Step 3: Add dev proxies**

`vite.config.js`:

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// `npm run dev` now runs the real API: `node server.js` beside it, and this
// proxy in front. That is the whole local setup — `vercel dev` is gone, and
// with it the rule that PDF and Word export only worked in deployment.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:3000',
    },
  },
})
```

`sign/vite.config.js`:

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api': 'http://127.0.0.1:3001',
    },
  },
})
```

- [ ] **Step 4: Move build-only packages to devDependencies**

In `package.json`, the runtime needs only what the server imports. Move `vite`, `@vitejs/plugin-react`, `react`, `react-dom`, `docx`, `file-saver`, `html2canvas` and `jspdf` to `devDependencies` — all of them are bundled into `dist/` at build time and never imported by `server.js`. Remove `@vercel/blob` entirely. Add the `start` script:

```json
{
  "scripts": {
    "dev": "vite",
    "start": "node server.js",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "resend": "^6.23.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^6.0.1",
    "docx": "^9.6.1",
    "file-saver": "^2.0.5",
    "html2canvas": "^1.4.1",
    "jspdf": "^4.2.1",
    "react": "^19.2.4",
    "react-dom": "^19.2.4",
    "vite": "^8.0.4",
    "vitest": "^4.1.11"
  }
}
```

In `sign/package.json`, do the same. `pdf-lib` stays a runtime dependency — `sign/api/proposal-sign.js` imports it on the server:

```json
{
  "scripts": {
    "dev": "vite",
    "start": "node server.js",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "pdf-lib": "^1.17.1",
    "resend": "^6.23.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^6.0.1",
    "html2canvas": "^1.4.1",
    "react": "^19.2.4",
    "react-dom": "^19.2.4",
    "vite": "^8.0.4"
  }
}
```

- [ ] **Step 5: Verify the split is right**

Run:
```bash
npm ci --omit=dev && node -e "import('./server.js')" ; npm ci
```
Expected: `server.js` boots with only production dependencies installed. If it throws `ERR_MODULE_NOT_FOUND`, that package belongs back in `dependencies`. Restore full deps with the trailing `npm ci`.

Repeat inside `sign/`.

- [ ] **Step 6: Run both builds and the suite**

Run: `npm run build && (cd sign && npm run build) && npm test`
Expected: both builds emit `dist/`, tests pass.

- [ ] **Step 7: Rewrite the README's deployment and local-development sections**

Replace the `## העלאה ל-Vercel` section, the `### שני פרויקטים ב-Vercel` table, the `### הקמה ראשונית` list and the `### פיתוח מקומי` section. The new content must say:

- the two apps run on one VPS behind nginx, as `proposal-gen` (`:3000`) and `proposal-sign` (`:3001`)
- the table's "Root Directory" column becomes "service", values `proposal-gen` / `proposal-sign`
- what couples them is now `/var/lib/proposals`, not a Blob store — update the sentence saying both must be connected to the same Blob Store
- first-time setup is `deploy/bootstrap.sh`, then a Cloudflare Origin certificate, then `scripts/deploy.sh`
- local development is two terminals: `node server.js` + `npm run dev` for the generator, `node sign/server.js` + `npm run dev` in `sign/` for the signing app, with `PROPOSALS_DIR` pointed at a scratch directory
- delete the claim that PDF and Word export do not work locally; they do now

Keep every Hebrew heading and the existing tone.

- [ ] **Step 8: Commit**

```bash
git add sign/lib/routes.js sign/server.js vite.config.js sign/vite.config.js package.json sign/package.json package-lock.json sign/package-lock.json README.md
git commit -m "feat: signing app adapter, dev proxies, drop the build toolchain from runtime deps"
```

---

## Task 8: Provision the droplet

**Files:**
- Create: `deploy/bootstrap.sh`

**Interfaces:**
- Produces: a host with Node 24, nginx, both users, `/var/lib/proposals` at `2770 root:proposals`, swap, and ufw closed to everything but SSH and Cloudflare

Idempotent: safe to re-run.

- [ ] **Step 1: Write the script**

Create `deploy/bootstrap.sh`:

```bash
#!/usr/bin/env bash
# Provisions a bare Ubuntu 24.04 droplet to serve both proposal apps.
# Idempotent — safe to re-run after an edit.
#
# Usage:  ssh root@46.101.139.175 'bash -s' < deploy/bootstrap.sh
set -euo pipefail

DATA_DIR=/var/lib/proposals
CF_IPS_V4=https://www.cloudflare.com/ips-v4
CF_IPS_V6=https://www.cloudflare.com/ips-v6

echo "==> swap"
if ! swapon --show | grep -q swapfile; then
  fallocate -l 1G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
sysctl -w vm.swappiness=10
grep -q '^vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >> /etc/sysctl.conf

echo "==> packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg nginx rsync unattended-upgrades

echo "==> node 24"
if ! command -v node >/dev/null || [[ "$(node -v)" != v24.* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y -qq nodejs
fi
node -v

echo "==> users and data directory"
getent group proposals >/dev/null || groupadd --system proposals
for user in proposal-gen proposal-sign; do
  id -u "$user" >/dev/null 2>&1 || \
    useradd --system --gid proposals --home-dir /nonexistent --shell /usr/sbin/nologin "$user"
done

mkdir -p "$DATA_DIR"
chown root:proposals "$DATA_DIR"
# setgid: files created by either app stay readable by the other. This shared
# directory is what replaces the shared Blob store.
chmod 2770 "$DATA_DIR"

mkdir -p /srv/proposal-generator/releases /srv/proposal-sign/releases
chown -R proposal-gen:proposals /srv/proposal-generator
chown -R proposal-sign:proposals /srv/proposal-sign

echo "==> firewall"
ufw --force reset >/dev/null
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'ssh'
# 80/443 only from Cloudflare. The origin must not be reachable directly, or
# the edge protection on quote.boolzai.co.il means nothing.
for ip in $(curl -fsSL "$CF_IPS_V4") $(curl -fsSL "$CF_IPS_V6"); do
  ufw allow from "$ip" to any port 80,443 proto tcp comment 'cloudflare'
done
ufw --force enable
ufw status numbered

echo "==> unattended upgrades"
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "==> done"
```

- [ ] **Step 2: Make it executable and run it**

```bash
chmod +x deploy/bootstrap.sh
ssh root@46.101.139.175 'bash -s' < deploy/bootstrap.sh
```
Expected: ends with `==> done`, no errors.

- [ ] **Step 3: Verify the host state**

```bash
ssh root@46.101.139.175 'node -v; swapon --show; ls -ld /var/lib/proposals; id proposal-gen; id proposal-sign; ufw status | head -20'
```
Expected: `v24.x`; a 1G swapfile; `drwxrws--- root proposals`; both users exist in group `proposals`; ufw active with 22 open and 80/443 only from Cloudflare ranges.

- [ ] **Step 4: Commit**

```bash
git add deploy/bootstrap.sh
git commit -m "feat: droplet bootstrap script"
```

---

## Task 9: nginx, TLS and the vhosts

**Files:**
- Create: `deploy/nginx/quote.boolzai.co.il.conf`, `deploy/nginx/sign.boolzai.co.il.conf`, `deploy/nginx/cloudflare-realip.conf`

**Interfaces:**
- Consumes: the systemd services from Task 10 on `127.0.0.1:3000` and `:3001`; release dirs from Task 11
- Produces: TLS-terminating vhosts for both hostnames

- [ ] **Step 1: Generate and install the Cloudflare Origin certificate**

In the Cloudflare dashboard for `boolzai.co.il`: **SSL/TLS → Origin Server → Create Certificate**. Accept the default private key type, set hostnames to `*.boolzai.co.il` and `boolzai.co.il`, and choose 15 years.

Install both halves on the droplet:

```bash
ssh root@46.101.139.175 'mkdir -p /etc/ssl/cloudflare && chmod 700 /etc/ssl/cloudflare'
# paste the certificate
ssh root@46.101.139.175 'cat > /etc/ssl/cloudflare/origin.pem' < origin.pem
# paste the private key
ssh root@46.101.139.175 'cat > /etc/ssl/cloudflare/origin.key && chmod 600 /etc/ssl/cloudflare/origin.key' < origin.key
```

Then set **SSL/TLS → Overview → Full (strict)** for the zone.

- [ ] **Step 2: Write the real-IP snippet**

Create `deploy/nginx/cloudflare-realip.conf`:

```nginx
# Without this every request appears to come from Cloudflare, which makes the
# access log useless and any future rate limit meaningless.
# Regenerate with: curl https://www.cloudflare.com/ips-v4 https://www.cloudflare.com/ips-v6
set_real_ip_from 173.245.48.0/20;
set_real_ip_from 103.21.244.0/22;
set_real_ip_from 103.22.200.0/22;
set_real_ip_from 103.31.4.0/22;
set_real_ip_from 141.101.64.0/18;
set_real_ip_from 108.162.192.0/18;
set_real_ip_from 190.93.240.0/20;
set_real_ip_from 188.114.96.0/20;
set_real_ip_from 197.234.240.0/22;
set_real_ip_from 198.41.128.0/17;
set_real_ip_from 162.158.0.0/15;
set_real_ip_from 104.16.0.0/13;
set_real_ip_from 104.24.0.0/14;
set_real_ip_from 172.64.0.0/13;
set_real_ip_from 131.0.72.0/22;
set_real_ip_from 2400:cb00::/32;
set_real_ip_from 2606:4700::/32;
set_real_ip_from 2803:f800::/32;
set_real_ip_from 2405:b500::/32;
set_real_ip_from 2405:8100::/32;
set_real_ip_from 2a06:98c0::/29;
set_real_ip_from 2c0f:f248::/32;

real_ip_header CF-Connecting-IP;
```

Before committing, refresh the list: `curl -s https://www.cloudflare.com/ips-v4; curl -s https://www.cloudflare.com/ips-v6`. Replace the block above with what that returns.

- [ ] **Step 3: Write the generator vhost**

Create `deploy/nginx/quote.boolzai.co.il.conf`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name quote.boolzai.co.il;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name quote.boolzai.co.il;

    ssl_certificate     /etc/ssl/cloudflare/origin.pem;
    ssl_certificate_key /etc/ssl/cloudflare/origin.key;
    ssl_protocols TLSv1.2 TLSv1.3;

    include /etc/nginx/snippets/cloudflare-realip.conf;

    root /srv/proposal-generator/current/dist;
    index index.html;

    access_log /var/log/nginx/quote.access.log;
    error_log  /var/log/nginx/quote.error.log;

    # Chunks are 5MB; the ceiling leaves room for headers and a retry that
    # rounds up. The per-kind caps are enforced in the handler.
    client_max_body_size 40m;

    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # originOf() in shared/http.js reads these to build the signing link.
        proxy_set_header Host              $host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Host  $host;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;

        # A 30MB upload over tethering is slow by nature; do not cut it off.
        proxy_read_timeout    300s;
        proxy_send_timeout    300s;
        proxy_request_buffering off;
    }

    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

- [ ] **Step 4: Write the signing vhost**

Create `deploy/nginx/sign.boolzai.co.il.conf` — identical to the above except:

- `server_name sign.boolzai.co.il;`
- `root /srv/proposal-sign/current/dist;`
- `proxy_pass http://127.0.0.1:3001;`
- logs `sign.access.log` / `sign.error.log`

The `try_files $uri $uri/ /index.html;` line matters more here than on the generator: the client's link is `/s/<token>`, which is not a file, and `sign/src/main.jsx` matches it client-side.

- [ ] **Step 5: Install and reload**

```bash
ssh root@46.101.139.175 'mkdir -p /etc/nginx/snippets'
scp deploy/nginx/cloudflare-realip.conf root@46.101.139.175:/etc/nginx/snippets/
scp deploy/nginx/quote.boolzai.co.il.conf deploy/nginx/sign.boolzai.co.il.conf \
    root@46.101.139.175:/etc/nginx/sites-available/
ssh root@46.101.139.175 '
  ln -sf /etc/nginx/sites-available/quote.boolzai.co.il.conf /etc/nginx/sites-enabled/
  ln -sf /etc/nginx/sites-available/sign.boolzai.co.il.conf  /etc/nginx/sites-enabled/
  rm -f /etc/nginx/sites-enabled/default
  nginx -t'
```
Expected: `syntax is ok` / `test is successful`. Do **not** reload yet — the release directories do not exist until Task 11.

- [ ] **Step 6: Commit**

```bash
git add deploy/nginx/
git commit -m "feat: nginx vhosts with Cloudflare origin TLS and real-ip"
```

---

## Task 10: systemd units

**Files:**
- Create: `deploy/systemd/proposal-gen.service`, `deploy/systemd/proposal-sign.service`

**Interfaces:**
- Consumes: `/srv/<app>/current/server.js`, `/etc/<app>.env`
- Produces: `proposal-gen.service` and `proposal-sign.service`

- [ ] **Step 1: Write the generator unit**

Create `deploy/systemd/proposal-gen.service`:

```ini
[Unit]
Description=Boolzai proposal generator (internal)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=proposal-gen
Group=proposals
WorkingDirectory=/srv/proposal-generator/current
ExecStart=/usr/bin/node server.js
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=PROPOSALS_DIR=/var/lib/proposals
EnvironmentFile=/etc/proposal-generator.env
Restart=always
RestartSec=2

# New files must stay group-writable so the signing app can read them.
UMask=0007

NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/proposals
ProtectKernelTunables=true
ProtectControlGroups=true
RestrictSUIDSGID=true

# Throttle rather than kill: a spike while pdf-lib works on a 30MB raster
# should slow down, not drop a client's signature.
MemoryHigh=400M
MemoryMax=600M

StandardOutput=journal
StandardError=journal
SyslogIdentifier=proposal-gen

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 2: Write the signing unit**

Create `deploy/systemd/proposal-sign.service` — identical except:

- `Description=Boolzai proposal signing page (client-facing)`
- `User=proposal-sign`
- `WorkingDirectory=/srv/proposal-sign/current`
- `Environment=PORT=3001`
- `EnvironmentFile=/etc/proposal-sign.env`
- `SyslogIdentifier=proposal-sign`

- [ ] **Step 3: Write the environment files on the server**

These hold secrets and are never committed. `BLOB_READ_WRITE_TOKEN` is gone; everything else carries over from the Vercel project settings.

```bash
ssh root@46.101.139.175 'cat > /etc/proposal-generator.env <<EOF
RESEND_API_KEY=<from Vercel>
MAIL_FROM="Boolzai <proposals@boolzai.co.il>"
APP_ACCESS_CODE=<from Vercel>
SIGN_BASE_URL=https://sign.boolzai.co.il
EOF
chmod 600 /etc/proposal-generator.env
chown root:proposal-gen /etc/proposal-generator.env
chmod 640 /etc/proposal-generator.env'

ssh root@46.101.139.175 'cat > /etc/proposal-sign.env <<EOF
RESEND_API_KEY=<from Vercel>
MAIL_FROM="Boolzai <proposals@boolzai.co.il>"
OWNER_EMAIL=dev@boolzai.co.il
EOF
chown root:proposal-sign /etc/proposal-sign.env
chmod 640 /etc/proposal-sign.env'
```

- [ ] **Step 4: Install the units**

```bash
scp deploy/systemd/*.service root@46.101.139.175:/etc/systemd/system/
ssh root@46.101.139.175 'systemctl daemon-reload && systemctl enable proposal-gen proposal-sign'
```
Expected: both enabled. They will not start until Task 11 puts code at `current/`.

- [ ] **Step 5: Commit**

```bash
git add deploy/systemd/
git commit -m "feat: systemd units for both services"
```

---

## Task 11: Deploy script

**Files:**
- Create: `scripts/deploy.sh`

**Interfaces:**
- Consumes: `dist/` from both builds, the systemd units from Task 10
- Produces: a new timestamped release, `current` repointed, services restarted

- [ ] **Step 1: Write the script**

Create `scripts/deploy.sh`:

```bash
#!/usr/bin/env bash
# Builds both apps locally and ships them to the droplet.
#
# Builds happen here, not there: the droplet has one core, and a Vite build
# competing with two live services is a bad trade for a box this size.
#
# Usage:  ./scripts/deploy.sh [gen|sign|both]
set -euo pipefail

HOST=${DEPLOY_HOST:-root@46.101.139.175}
TARGET=${1:-both}
STAMP=$(date -u +%Y%m%d-%H%M%S)
KEEP=3

deploy_app() {
  local name=$1 src=$2 srv=$3 service=$4 owner=$5
  local release="/srv/$srv/releases/$STAMP"

  echo "==> building $name"
  (cd "$src" && npm ci && npm run build)

  echo "==> shipping $name to $release"
  ssh "$HOST" "mkdir -p $release"

  # Ship sources, the built client, and the manifests. node_modules is
  # installed on the far side so a Windows or macOS tree never travels.
  rsync -az --delete \
    --exclude node_modules --exclude .git --exclude '*.test.js' \
    "$src/dist"         "$HOST:$release/"
  rsync -az \
    "$src/api" "$src/lib" "$src/server.js" \
    "$src/package.json" "$src/package-lock.json" \
    "$HOST:$release/"

  # shared/ lives at the repo root but each app needs its own copy, because
  # each deploys from its own directory. Same reason the stores are twins.
  rsync -az "$(dirname "$0")/../shared" "$HOST:$release/"

  ssh "$HOST" "
    set -euo pipefail
    cd $release
    npm ci --omit=dev --no-audit --no-fund
    chown -R $owner:proposals $release
    ln -sfn $release /srv/$srv/current
    systemctl restart $service
    sleep 1
    systemctl is-active --quiet $service || { journalctl -u $service -n 40 --no-pager; exit 1; }
    ls -1dt /srv/$srv/releases/*/ | tail -n +$((KEEP + 1)) | xargs -r rm -rf
  "
  echo "==> $name is live at $release"
}

ROOT=$(cd "$(dirname "$0")/.." && pwd)

if [[ "$TARGET" == "gen" || "$TARGET" == "both" ]]; then
  deploy_app "generator" "$ROOT" "proposal-generator" "proposal-gen" "proposal-gen"
fi

if [[ "$TARGET" == "sign" || "$TARGET" == "both" ]]; then
  deploy_app "signing app" "$ROOT/sign" "proposal-sign" "proposal-sign" "proposal-sign"
fi

echo "==> reloading nginx"
ssh "$HOST" 'nginx -t && systemctl reload nginx'
```

Note the signing app's `shared/` copy: `sign/api/_lib/store.js` imports `../../../shared/proposal.js`, which resolves above `sign/`. The rsync of `shared/` into the release root satisfies that for the generator; for the signing app the release root **is** `sign/`, so `../../../shared` points one level above `/srv/proposal-sign/current`. Fix by shipping shared/ to `/srv/proposal-sign/` rather than into the release:

```bash
  if [[ "$srv" == "proposal-sign" ]]; then
    rsync -az "$ROOT/shared" "$HOST:/srv/$srv/"
  else
    rsync -az "$ROOT/shared" "$HOST:$release/"
  fi
```

Verify the resolved path on the server after the first deploy with `node -e "import('/srv/proposal-sign/current/api/_lib/store.js')"`; if it throws `ERR_MODULE_NOT_FOUND`, adjust the destination until it resolves.

- [ ] **Step 2: Make it executable and deploy**

```bash
chmod +x scripts/deploy.sh
./scripts/deploy.sh both
```
Expected: both apps build, ship, install, restart, and report live. nginx reloads cleanly.

- [ ] **Step 3: Verify both services over the raw IP, before any DNS change**

```bash
ssh root@46.101.139.175 '
  systemctl is-active proposal-gen proposal-sign
  curl -sS -o /dev/null -w "gen  %{http_code}\n" -H "Host: quote.boolzai.co.il" -k https://127.0.0.1/
  curl -sS -o /dev/null -w "sign %{http_code}\n" -H "Host: sign.boolzai.co.il"  -k https://127.0.0.1/
  curl -sS -XPOST -H "Host: quote.boolzai.co.il" -H "x-app-code: $(grep APP_ACCESS_CODE /etc/proposal-generator.env | cut -d= -f2)" \
       -k https://127.0.0.1/api/proposal-id'
```
Expected: both active; both `200`; the last call returns a JSON `proposalId`.

**Then undo that allocation** — it burned a number from the empty local counter, and Task 12 is about to overwrite the counter with the real one anyway:

```bash
ssh root@46.101.139.175 'rm -f /var/lib/proposals/counters/proposal-id.json'
```

- [ ] **Step 4: Commit**

```bash
git add scripts/deploy.sh
git commit -m "feat: deploy script with timestamped releases and rollback"
```

---

## Task 12: Migrate the Blob store

**Files:**
- Create: `scripts/migrate-blob-to-fs.js`

**Interfaces:**
- Consumes: `BLOB_READ_WRITE_TOKEN`, `@vercel/blob` (installed temporarily, not a project dependency)
- Produces: a local staging tree mirroring the Blob store exactly, and a verification report

This is the task where an error is irreversible. The counter is the thing to protect.

- [ ] **Step 1: Write the script**

Create `scripts/migrate-blob-to-fs.js`:

```js
import { list } from "@vercel/blob";
import { mkdir, writeFile, stat } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";

// ============================================================
// One-off: copy the whole Vercel Blob store into a local tree.
//
// Run once, during the cutover freeze, then rsync the result to
// the droplet. Not part of the application — it exists to be
// used twice (a rehearsal and the real thing) and then deleted.
//
// Usage:
//   BLOB_READ_WRITE_TOKEN=… node scripts/migrate-blob-to-fs.js ./blob-export
// ============================================================

const out = resolve(process.argv[2] ?? "./blob-export");

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error("BLOB_READ_WRITE_TOKEN is not set");
  process.exit(1);
}

function safeJoin(root, pathname) {
  const full = resolve(root, pathname);
  if (!full.startsWith(root + sep)) {
    throw new Error(`Refusing to write outside the export root: ${pathname}`);
  }
  return full;
}

const blobs = [];
let cursor;
do {
  const page = await list({ cursor, limit: 1000 });
  blobs.push(...page.blobs);
  cursor = page.hasMore ? page.cursor : undefined;
  console.log(`listed ${blobs.length} objects…`);
} while (cursor);

console.log(`\n${blobs.length} objects to copy into ${out}\n`);

let copied = 0;
const mismatches = [];

for (const blob of blobs) {
  const target = safeJoin(out, blob.pathname);
  await mkdir(dirname(target), { recursive: true });

  const response = await fetch(blob.downloadUrl ?? blob.url);
  if (!response.ok) {
    mismatches.push(`${blob.pathname}: download failed with ${response.status}`);
    continue;
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(target, bytes);

  // The listing states a size; if what landed disagrees, say so loudly rather
  // than discovering it when a client opens a truncated PDF.
  const onDisk = (await stat(target)).size;
  if (blob.size !== undefined && onDisk !== blob.size) {
    mismatches.push(`${blob.pathname}: expected ${blob.size} bytes, wrote ${onDisk}`);
  }

  copied += 1;
  if (copied % 25 === 0) console.log(`copied ${copied}/${blobs.length}`);
}

console.log(`\ncopied ${copied}/${blobs.length}`);

// The counter is the one file whose loss cannot be undone: without it the
// system reseeds at 50001 and re-issues numbers already printed on documents
// sitting with clients.
const counter = join(out, "counters", "proposal-id.json");
try {
  const raw = await import("node:fs/promises").then((fs) => fs.readFile(counter, "utf8"));
  const parsed = JSON.parse(raw);
  console.log(`counter: next = ${parsed.next}`);
  if (!Number.isInteger(parsed.next) || parsed.next < 50001) {
    mismatches.push(`counter has an implausible next: ${parsed.next}`);
  }
} catch (err) {
  mismatches.push(`COUNTER MISSING OR UNREADABLE: ${err.message}`);
}

const proposals = new Set(
  blobs
    .filter((b) => b.pathname.startsWith("proposals/"))
    .map((b) => b.pathname.split("/")[1]),
);
console.log(`proposals: ${proposals.size}`);

if (mismatches.length) {
  console.error(`\n${mismatches.length} PROBLEM(S):`);
  for (const line of mismatches) console.error(`  - ${line}`);
  process.exit(1);
}

console.log("\nexport verified — safe to rsync");
```

- [ ] **Step 2: Rehearse the migration against a scratch directory**

Obtain `BLOB_READ_WRITE_TOKEN` from the Vercel dashboard (Storage → the Blob store → connected project → environment variables), then:

```bash
npm i --no-save @vercel/blob
BLOB_READ_WRITE_TOKEN=<token> node scripts/migrate-blob-to-fs.js ./blob-export
```
Expected: ends with `export verified — safe to rsync`, prints the proposal count and the counter's `next`. **Write both numbers down** — they are what Step 5 checks against.

If it exits non-zero, stop and fix before going further. A `COUNTER MISSING` line means do not proceed under any circumstances.

- [ ] **Step 3: Compare against the live archive**

Open the generator on Vercel and count the rows in the archive. It must equal the `proposals:` number the script printed.

If they differ, the difference should be explainable — a `pending` record never completed, for instance, which the archive hides and the export includes. An unexplained difference means stop.

- [ ] **Step 4: Ship the tree** (during the freeze — see Task 14)

```bash
rsync -az --stats ./blob-export/ root@46.101.139.175:/var/lib/proposals/
ssh root@46.101.139.175 '
  chown -R root:proposals /var/lib/proposals
  chmod -R g+rwX /var/lib/proposals
  find /var/lib/proposals -type d -exec chmod 2770 {} +
  ls -l /var/lib/proposals/counters/proposal-id.json'
```

- [ ] **Step 5: Verify on the server before it takes traffic**

```bash
ssh root@46.101.139.175 '
  echo -n "counter: "; cat /var/lib/proposals/counters/proposal-id.json
  echo -n "proposals: "; ls -1 /var/lib/proposals/proposals | wc -l'
```
Expected: the counter matches what Step 2 printed, and the proposal count matches.

**This is the cutover gate. If the counter is absent or its `next` is below what Vercel had, do not continue — repointing DNS now would re-issue numbers already on client documents.**

- [ ] **Step 6: Confirm the app reads the migrated store**

```bash
ssh root@46.101.139.175 'systemctl restart proposal-gen && sleep 1 &&
  curl -sS -H "Host: quote.boolzai.co.il" \
       -H "x-app-code: $(grep APP_ACCESS_CODE /etc/proposal-generator.env | cut -d= -f2)" \
       -k https://127.0.0.1/api/proposals-list | head -c 400'
```
Expected: JSON listing the migrated proposals.

- [ ] **Step 7: Commit the script, not the data**

```bash
echo "blob-export/" >> .gitignore
git add scripts/migrate-blob-to-fs.js .gitignore
git commit -m "feat: one-off Blob to filesystem migration script"
```

---

## Task 13: Backups

**Files:**
- Create: `deploy/backup.sh`, `deploy/systemd/proposal-backup.service`, `deploy/systemd/proposal-backup.timer`

**Interfaces:**
- Produces: a nightly off-box snapshot of `/var/lib/proposals` and a verified restore

After the cutover this directory is the only copy of every signed contract. A backup that lives on the droplet dies with the droplet.

- [ ] **Step 1: Choose the off-box destination**

This is the plan's one open decision. Pick one and set `BACKUP_REMOTE` in `/etc/proposal-backup.env` accordingly:

- **restic to Backblaze B2** — deduplicated, encrypted, cheap; needs a B2 bucket and keys
- **restic to a second droplet or any SFTP host** — stays entirely on infrastructure you control
- **DigitalOcean Spaces** — same region, S3 API, simplest to provision from the existing account

The steps below assume restic; the repository URL is the only thing that changes between them.

- [ ] **Step 2: Write the backup script**

Create `deploy/backup.sh`:

```bash
#!/usr/bin/env bash
# Nightly off-box snapshot of the proposal store.
#
# /var/lib/proposals is the only copy of every signed contract. A tar in
# /var/backups on the same disk is not a backup; it dies with the disk.
set -euo pipefail

source /etc/proposal-backup.env   # RESTIC_REPOSITORY, RESTIC_PASSWORD, provider keys

export RESTIC_REPOSITORY RESTIC_PASSWORD

restic backup /var/lib/proposals \
  --tag proposals \
  --exclude '*.part' \
  --exclude '*.tmp' \
  --exclude '*.lock'

# Long enough to survive a corruption noticed weeks later, not just a disk
# lost yesterday.
restic forget \
  --tag proposals \
  --keep-daily 14 --keep-weekly 8 --keep-monthly 12 \
  --prune

restic check --read-data-subset=5%
```

- [ ] **Step 3: Write the timer**

Create `deploy/systemd/proposal-backup.service`:

```ini
[Unit]
Description=Off-box snapshot of the proposal store
After=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/proposal-backup.sh
```

Create `deploy/systemd/proposal-backup.timer`:

```ini
[Unit]
Description=Nightly proposal store backup

[Timer]
OnCalendar=*-*-* 02:30:00
RandomizedDelaySec=15m
Persistent=true

[Install]
WantedBy=timers.target
```

- [ ] **Step 4: Install and run once**

```bash
ssh root@46.101.139.175 'apt-get install -y -qq restic'
scp deploy/backup.sh root@46.101.139.175:/usr/local/bin/proposal-backup.sh
scp deploy/systemd/proposal-backup.* root@46.101.139.175:/etc/systemd/system/
ssh root@46.101.139.175 '
  chmod 700 /usr/local/bin/proposal-backup.sh
  chmod 600 /etc/proposal-backup.env
  set -a; . /etc/proposal-backup.env; set +a; restic init || true
  systemctl daemon-reload
  systemctl enable --now proposal-backup.timer
  systemctl start proposal-backup.service
  journalctl -u proposal-backup.service -n 30 --no-pager'
```
Expected: a snapshot is created and `restic check` passes.

- [ ] **Step 5: Actually restore from it**

A backup never restored is not known to be a backup.

```bash
ssh root@46.101.139.175 '
  set -a; . /etc/proposal-backup.env; set +a
  rm -rf /tmp/restore-test && mkdir -p /tmp/restore-test
  restic restore latest --target /tmp/restore-test
  echo -n "restored counter: "; cat /tmp/restore-test/var/lib/proposals/counters/proposal-id.json
  echo -n "restored proposals: "; ls -1 /tmp/restore-test/var/lib/proposals/proposals | wc -l
  diff -r /var/lib/proposals/proposals /tmp/restore-test/var/lib/proposals/proposals && echo "IDENTICAL"
  rm -rf /tmp/restore-test'
```
Expected: `IDENTICAL`, and the counter and proposal count match the live store.

- [ ] **Step 6: Add a disk alert**

```bash
ssh root@46.101.139.175 'cat > /etc/cron.daily/proposal-disk-check <<EOF
#!/bin/sh
USED=\$(df --output=pcent /var/lib/proposals | tail -1 | tr -dc "0-9")
[ "\$USED" -ge 80 ] && echo "proposal store disk at \${USED}% on \$(hostname)" | \
  logger -t proposal-disk -p user.warning
exit 0
EOF
chmod +x /etc/cron.daily/proposal-disk-check'
```

- [ ] **Step 7: Commit**

```bash
git add deploy/backup.sh deploy/systemd/proposal-backup.service deploy/systemd/proposal-backup.timer
git commit -m "feat: nightly off-box backups with a verified restore"
```

---

## Task 14: Cutover

**Files:**
- Create: `docs/runbook-cutover.md`

This task changes production. Everything before it was reversible; the DNS flip is the moment clients start reaching the droplet.

- [ ] **Step 1: Write the runbook**

Create `docs/runbook-cutover.md` capturing the sequence below, so that whoever runs it is not reading a plan document at the time.

- [ ] **Step 2: Pre-flight, before touching DNS**

```bash
ssh root@46.101.139.175 '
  systemctl is-active proposal-gen proposal-sign nginx
  curl -sS -o /dev/null -w "gen  %{http_code}\n" -H "Host: quote.boolzai.co.il" -k https://127.0.0.1/
  curl -sS -o /dev/null -w "sign %{http_code}\n" -H "Host: sign.boolzai.co.il"  -k https://127.0.0.1/'
```
Expected: three `active`, two `200`.

- [ ] **Step 3: Announce the freeze**

Tell the team: create no proposals until told otherwise. Expected duration 30 minutes.

- [ ] **Step 4: Run the migration**

Execute Task 12 Steps 2–6 now, against the live store. The gate in Step 5 is binding: a missing or regressed counter stops the cutover.

- [ ] **Step 5: Repoint DNS**

In Cloudflare, for `boolzai.co.il`:

- `quote` — change the record to **A → 46.101.139.175**, proxy **on** (orange)
- `sign` — change the record to **A → 46.101.139.175**, proxy **on** (orange)

Delete any `AAAA` record for either name; the droplet is reachable over IPv4 and a stale `AAAA` will black-hole a share of traffic.

Leave the existing Cloudflare rule protecting `quote` in place.

- [ ] **Step 6: Verify the public path**

```bash
curl -sS -o /dev/null -D - https://sign.boolzai.co.il/ | grep -iE '^HTTP|server:|x-vercel'
```
Expected: `200`, `server: cloudflare`, and **no** `x-vercel-*` header — that absence is the proof traffic now lands on the droplet.

Then, by hand in a browser:

1. Open a signing link created **before** the migration. It must load, show the proposal, and accept a signature.
2. Confirm both the client and `OWNER_EMAIL` receive the signed PDF.
3. Open the generator, open the archive, and confirm it lists what it listed on Vercel.
4. Download a PDF, a signed PDF and a Word file from the archive.
5. Create a new proposal end to end. Confirm its number is the next in sequence and appears nowhere else.
6. Send it to a test address and sign it.

- [ ] **Step 6b: Verify a large upload on a bad connection**

This is the behaviour that replaced `multipart: true`, and the only part of the system whose failure mode is specific to the people using it. Unit tests cover the retry logic with mocks; this covers the real path through nginx.

In Chrome DevTools, Network tab, set throttling to **Slow 3G**, then create a proposal whose PDF is close to the 30MB ceiling (a long proposal with several image-heavy pages).

Expected: the upload proceeds chunk by chunk, the progress text advances, and it completes. Then repeat, and mid-upload switch throttling to **Offline** for a few seconds before switching back.

Expected: the interrupted chunk is retried at the same offset and the upload completes with a correct file — not a corrupted or doubled one. Confirm by downloading the PDF from the archive and opening it.

- [ ] **Step 7: Confirm the origin is not reachable directly**

```bash
curl -sS --max-time 10 -k https://46.101.139.175/ -H 'Host: sign.boolzai.co.il' || echo "refused, as intended"
```
Expected: a timeout or refusal. A `200` means ufw is not restricting 443 to Cloudflare and the edge protection on `quote` can be bypassed — fix before lifting the freeze.

- [ ] **Step 8: Lift the freeze**

- [ ] **Step 9: Watch for a day**

```bash
ssh root@46.101.139.175 'journalctl -u proposal-gen -u proposal-sign --since "1 hour ago" -p warning --no-pager'
```

Leave the Vercel projects deployed and the Blob store untouched for several weeks. Rollback is repointing the two Cloudflare records back to their previous values.

- [ ] **Step 10: Commit the runbook**

```bash
git add docs/runbook-cutover.md
git commit -m "docs: cutover runbook"
```

---

## Decommissioning (not yet)

Only after the droplet has carried real traffic for several weeks, and a restore has been verified from a backup taken *after* the cutover:

1. Confirm the Cloudflare records still point at the droplet and rollback is genuinely no longer wanted.
2. Delete the two Vercel projects — **this is what makes it safe to merge `migrate-to-vps` into `main`**, since `main` no longer deploys anywhere.
3. Delete the Blob store.
4. Merge `migrate-to-vps` into `main` and push.
5. Remove `BLOB_READ_WRITE_TOKEN` from `.env.example` and `sign/.env.example`, replacing it with `PROPOSALS_DIR`.
6. Delete `scripts/migrate-blob-to-fs.js`.

Do not do any of this while the off-box backup destination from Task 13 Step 1 remains unchosen — until then, Blob is still the second copy.

Steps 2 and 4 are ordered deliberately. Merging first would push a tree with no `@vercel/blob` to a live Vercel project and destroy the rollback path in the same move.
