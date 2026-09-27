import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { syncDir, writeAtomic } from "./fsStore.js";

let dir;
let previous;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "fsstore-"));
  previous = process.env.PROPOSALS_DIR;
  process.env.PROPOSALS_DIR = dir;
});

afterEach(async () => {
  if (previous === undefined) delete process.env.PROPOSALS_DIR;
  else process.env.PROPOSALS_DIR = previous;
  await rm(dir, { recursive: true, force: true });
});

describe("syncDir", () => {
  it("flushes an existing directory", async () => {
    await expect(syncDir(dir)).resolves.toBeUndefined();
  });

  // On Windows syncDir is a deliberate no-op, so a missing directory cannot
  // be told apart from a present one there.
  it.skipIf(process.platform === "win32")(
    "fails loudly on a directory that is not there",
    async () => {
      await expect(syncDir(join(dir, "missing"))).rejects.toThrow(/ENOENT/);
    },
  );
});

describe("writeAtomic", () => {
  it("still writes the file whole, with the directory flush in place", async () => {
    await writeAtomic("counters/proposal-id.json", JSON.stringify({ next: 50002 }));
    const raw = await readFile(join(dir, "counters", "proposal-id.json"), "utf8");
    expect(JSON.parse(raw)).toEqual({ next: 50002 });
  });
});
