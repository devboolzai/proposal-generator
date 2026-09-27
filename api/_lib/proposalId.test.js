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
