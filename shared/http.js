import { timingSafeEqual } from "node:crypto";

// ============================================================
// Request plumbing shared by both projects' functions.
//
// Server-only, like the rest of shared/ — never imported by a
// browser bundle. Everything here is about failing early and
// identically, so each route can be about its own logic.
// ============================================================

export function sendJson(res, status, payload) {
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.statusCode = status;
  res.end(JSON.stringify(payload));
}

/**
 * Ends the request and returns false when the method is wrong, so routes read:
 *   if (!allowMethod(req, res, "POST")) return;
 */
export function allowMethod(req, res, method) {
  if (req.method === method) return true;
  res.setHeader("allow", method);
  sendJson(res, 405, { error: "Method not allowed" });
  return false;
}

/**
 * The access code guards every write path. Without it, anyone who found the
 * generator's URL could fill the Blob store with junk proposals.
 *
 * A missing APP_ACCESS_CODE fails closed rather than opening the door — a
 * misconfigured deploy must not become a public write endpoint.
 */
export function requireAccessCode(req, res) {
  const expected = process.env.APP_ACCESS_CODE;
  if (!expected) {
    sendJson(res, 500, { error: "APP_ACCESS_CODE is not configured" });
    return false;
  }
  const supplied = req.headers["x-app-code"];
  if (typeof supplied !== "string" || !safeEqual(supplied, expected)) {
    sendJson(res, 401, { error: "קוד גישה שגוי" });
    return false;
  }
  return true;
}

function safeEqual(a, b) {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  // timingSafeEqual throws on a length mismatch, which would itself leak the
  // length, so compare a fixed-size digest-shaped pair instead.
  if (bufA.length !== bufB.length) {
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/**
 * Vercel parses JSON bodies for us, but only when the client set the header.
 * This normalises both cases so routes never see a string.
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

/** Maps a thrown error onto a response, keeping Hebrew messages intact. */
export function fail(res, err, fallbackStatus = 500) {
  const status = err?.status ?? fallbackStatus;
  const message = err?.message ?? "אירעה שגיאה";
  if (status >= 500) console.error(err);
  sendJson(res, status, { error: message });
}

/**
 * The public origin this request arrived on. Lets the signing app build links
 * back to itself without being told its own domain in an env var — behind
 * Vercel's proxy, req.headers.host is the internal name.
 */
export function originOf(req) {
  const proto = header(req, "x-forwarded-proto") ?? "https";
  const host = header(req, "x-forwarded-host") ?? req.headers.host;
  return `${proto}://${host}`;
}

/** The first value of a header that may arrive as a comma-joined list. */
export function header(req, name) {
  const value = req.headers[name];
  if (!value) return undefined;
  return (Array.isArray(value) ? value[0] : value).split(",")[0].trim();
}

export function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}
