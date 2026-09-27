import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../shared/routes.js";

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

  it("answers a retried final chunk without touching the promoted file", async () => {
    await seedPending();
    await send({ token: TOKEN, kind: "pdf", offset: "0" }, "hello ");
    await send({ token: TOKEN, kind: "pdf", offset: "6", final: "1" }, "world");
    const res = await send({ token: TOKEN, kind: "pdf", offset: "6", final: "1" }, "world");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ pathname: `proposals/${TOKEN}/original.pdf`, size: 11 });
    const file = await readFile(join(dir, "proposals", TOKEN, "original.pdf"));
    expect(file.toString()).toBe("hello world");
  });

  it("refuses a chunk that would leave a gap", async () => {
    await seedPending();
    const res = await send({ token: TOKEN, kind: "pdf", offset: "6" }, "world");
    expect(res.status).toBe(409);
  });

  it("answers 500, and logs, when the record cannot be read", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await mkdir(join(dir, "proposals", TOKEN), { recursive: true });
    await writeFile(join(dir, "proposals", TOKEN, "meta.json"), "{ not json");
    const res = await send({ token: TOKEN, kind: "pdf", offset: "0" }, "x");
    expect(res.status).toBe(500);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
