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
