import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
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
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await fetch(`${base}/api/boom`);
    expect(res.status).toBe(500);
    // still serving
    expect((await fetch(`${base}/api/echo`)).status).toBe(200);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
