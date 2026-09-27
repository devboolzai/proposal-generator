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
