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

/**
 * A JSON body larger than this is a mistake or an attack; uploads do not come
 * through here. The ceiling is set by the signing page, whose JSON carries a
 * base64 PNG that sign/api/proposal-sign.js accepts up to 3MB (≈4MB once
 * encoded) — the same envelope the handlers were written against on Vercel.
 */
const MAX_JSON_BYTES = 5 * 1024 * 1024;

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
