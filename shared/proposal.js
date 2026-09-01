import { randomBytes } from "node:crypto";

// ============================================================
// THE PROPOSAL MODEL
//
// The single source of truth for how a shared proposal is laid
// out in Vercel Blob. Both Vercel projects — the generator and
// the signing app — import this module, which is why it lives
// outside either of their src trees: if the two ever disagreed
// about a pathname or an expiry rule, links would silently 404.
//
// There is no database. One folder per proposal:
//
//   proposals/<token>/meta.json     the record
//   proposals/<token>/original.pdf  what the client is asked to sign
//   proposals/<token>/signed.pdf    written once, at signing time
//
// Every blob is private; the token is both the key and the
// secret, so nothing here may ever build a pathname out of an
// unvalidated one.
//
// Deliberately free of npm dependencies — node: builtins only.
// The signing app is deployed with its Root Directory set to
// sign/, so anything imported from here has to resolve without
// a node_modules above it. The Blob calls therefore live in each
// project's own api/_lib/store.js; what must never drift — paths,
// statuses, expiry — lives here, once.
// ============================================================

const PREFIX = "proposals";

/** 24 random bytes, base64url-encoded — always exactly 32 characters. */
const TOKEN_BYTES = 24;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,64}$/;

const DEFAULT_EXPIRY_DAYS = 30;
const MAX_EXPIRY_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1000;

// Deliberately loose: this only catches typos before we waste a Resend call.
// Real validation is the client receiving the mail.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const STATUS = {
  PENDING: "pending", // record created, PDF not uploaded yet
  SENT: "sent", // PDF in place, link is live
  SIGNED: "signed", // terminal
};

const NEXT_STATUS = {
  [STATUS.PENDING]: [STATUS.SENT],
  [STATUS.SENT]: [STATUS.SIGNED],
  [STATUS.SIGNED]: [],
};

// ---------- tokens and paths ----------

export function newToken() {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function isValidToken(token) {
  return typeof token === "string" && TOKEN_PATTERN.test(token);
}

/**
 * The three keys belonging to one proposal. Throws on a token that could
 * escape the prefix — every Blob call in both projects goes through here,
 * so this is the one place a traversal attempt has to be stopped.
 */
export function paths(token) {
  if (!isValidToken(token)) {
    throw new Error("Invalid proposal token");
  }
  const base = `${PREFIX}/${token}`;
  return {
    base,
    meta: `${base}/meta.json`,
    original: `${base}/original.pdf`,
    signed: `${base}/signed.pdf`,
  };
}

// ---------- the record ----------

export function newMeta(
  { token, clientName, companyName, subject, clientEmail, fileName, expiresInDays },
  now = new Date(),
) {
  if (!isValidToken(token)) {
    throw new Error("Invalid proposal token");
  }
  if (typeof clientEmail !== "string" || !EMAIL_PATTERN.test(clientEmail)) {
    throw new Error("A valid client email is required");
  }

  const days = expiresInDays === undefined ? DEFAULT_EXPIRY_DAYS : expiresInDays;
  if (!Number.isFinite(days) || days <= 0 || days > MAX_EXPIRY_DAYS) {
    throw new Error(
      `Link expiry must be between 1 and ${MAX_EXPIRY_DAYS} days`,
    );
  }

  return {
    token,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + days * DAY_MS).toISOString(),
    status: STATUS.PENDING,
    clientName: clientName ?? "",
    companyName: companyName ?? "",
    subject: subject ?? "",
    clientEmail,
    fileName: fileName ?? "proposal.pdf",
    linkEmailedAt: null,
    signedAt: null,
    signerName: null,
    signerIp: null,
    signerUserAgent: null,
  };
}

/**
 * Fails closed: a record with a missing or unparsable expiry counts as
 * expired rather than handing out a link that never dies.
 */
export function isExpired(meta, now = new Date()) {
  const at = Date.parse(meta?.expiresAt ?? "");
  if (Number.isNaN(at)) return true;
  return now.getTime() >= at;
}

/** What the signed copy is called wherever it is handed to a person. */
export function signedFileName(fileName) {
  const base = fileName || "proposal.pdf";
  return `${base.replace(/\.pdf$/i, "")}_חתום.pdf`;
}

export function canTransition(from, to) {
  return (NEXT_STATUS[from] ?? []).includes(to);
}

export function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    throw new Error(`Cannot move a proposal from "${from}" to "${to}"`);
  }
}

// ---------- Blob options ----------

/**
 * Every blob this system writes is private and named exactly by its path —
 * the store.js in each project spreads this into its put/get calls so the two
 * cannot end up writing with different visibility.
 */
export const PRIVATE = { access: "private" };

export const META_PUT_OPTIONS = {
  ...PRIVATE,
  addRandomSuffix: false,
  allowOverwrite: true,
  contentType: "application/json",
  // meta.json changes on every transition; a cached copy would let a
  // proposal be signed twice.
  cacheControlMaxAge: 0,
};

export const PDF_PUT_OPTIONS = {
  ...PRIVATE,
  addRandomSuffix: false,
  allowOverwrite: true,
  contentType: "application/pdf",
};
