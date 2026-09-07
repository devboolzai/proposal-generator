import { describe, it, expect } from "vitest";
import {
  STATUS,
  newToken,
  isValidToken,
  paths,
  newMeta,
  isExpired,
  canTransition,
  assertTransition,
} from "./proposal.js";

describe("newToken", () => {
  it("produces a URL-safe token long enough to be unguessable", () => {
    const token = newToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    // 24 random bytes in base64url = 32 characters, no padding.
    expect(token).toHaveLength(32);
  });

  it("does not repeat", () => {
    const tokens = new Set(Array.from({ length: 200 }, newToken));
    expect(tokens.size).toBe(200);
  });

  it("produces tokens that pass validation", () => {
    expect(isValidToken(newToken())).toBe(true);
  });
});

describe("isValidToken", () => {
  it("rejects anything that could escape the proposals prefix", () => {
    expect(isValidToken("../../etc/passwd")).toBe(false);
    expect(isValidToken("abc/def")).toBe(false);
    expect(isValidToken("a".repeat(31) + "/")).toBe(false);
  });

  it("rejects tokens that are too short to be random", () => {
    expect(isValidToken("short")).toBe(false);
    expect(isValidToken("a".repeat(31))).toBe(false);
  });

  it("rejects non-strings and empty values", () => {
    expect(isValidToken(undefined)).toBe(false);
    expect(isValidToken(null)).toBe(false);
    expect(isValidToken("")).toBe(false);
    expect(isValidToken(12345678901234567890n)).toBe(false);
    expect(isValidToken({ toString: () => "a".repeat(32) })).toBe(false);
  });
});

describe("paths", () => {
  const token = "a".repeat(32);

  it("derives every key from the token under one folder", () => {
    expect(paths(token)).toEqual({
      base: `proposals/${token}`,
      meta: `proposals/${token}/meta.json`,
      original: `proposals/${token}/original.pdf`,
      signed: `proposals/${token}/signed.pdf`,
    });
  });

  it("refuses to build paths from an invalid token", () => {
    // Guards the whole store: every route reaches Blob through here, so a
    // traversal attempt can never become a real pathname.
    expect(() => paths("../other")).toThrow(/token/i);
  });
});

describe("newMeta", () => {
  const now = new Date("2026-01-01T10:00:00.000Z");
  const input = {
    proposalId: 50001,
    clientName: "דנה כהן",
    companyName: "אקמה בע\"מ",
    subject: "ניהול סושיאל",
    clientEmail: "dana@acme.co.il",
    fileName: "הצעת_מחיר_אקמה.pdf",
    expiresInDays: 30,
  };

  it("starts pending with the signing fields empty", () => {
    const meta = newMeta({ ...input, token: "b".repeat(32) }, now);
    expect(meta.status).toBe(STATUS.PENDING);
    expect(meta.signedAt).toBeNull();
    expect(meta.signerName).toBeNull();
    expect(meta.signerIp).toBeNull();
    expect(meta.signerUserAgent).toBeNull();
    expect(meta.linkEmailedAt).toBeNull();
  });

  it("sets the expiry the requested number of days out", () => {
    const meta = newMeta({ ...input, token: "b".repeat(32) }, now);
    expect(meta.createdAt).toBe("2026-01-01T10:00:00.000Z");
    expect(meta.expiresAt).toBe("2026-01-31T10:00:00.000Z");
  });

  it("keeps the client details verbatim, Hebrew included", () => {
    const meta = newMeta({ ...input, token: "b".repeat(32) }, now);
    expect(meta.clientName).toBe("דנה כהן");
    expect(meta.companyName).toBe("אקמה בע\"מ");
    expect(meta.fileName).toBe("הצעת_מחיר_אקמה.pdf");
  });

  it("falls back to 30 days when no expiry is given", () => {
    const { expiresInDays, ...rest } = input;
    const meta = newMeta({ ...rest, token: "b".repeat(32) }, now);
    expect(meta.expiresAt).toBe("2026-01-31T10:00:00.000Z");
  });

  it("rejects an expiry that is not a positive number of days", () => {
    for (const bad of [0, -1, "soon", NaN, 400]) {
      expect(() =>
        newMeta({ ...input, token: "b".repeat(32), expiresInDays: bad }, now),
      ).toThrow(/expir/i);
    }
  });

  it("requires an email to send the invite to", () => {
    expect(() =>
      newMeta({ ...input, token: "b".repeat(32), clientEmail: "" }, now),
    ).toThrow(/email/i);
    expect(() =>
      newMeta({ ...input, token: "b".repeat(32), clientEmail: "not-an-email" }, now),
    ).toThrow(/email/i);
  });
});

describe("isExpired", () => {
  const meta = { expiresAt: "2026-01-31T10:00:00.000Z" };

  it("is false before the expiry", () => {
    expect(isExpired(meta, new Date("2026-01-31T09:59:59.999Z"))).toBe(false);
  });

  it("is true exactly on the expiry", () => {
    expect(isExpired(meta, new Date("2026-01-31T10:00:00.000Z"))).toBe(true);
  });

  it("is true after the expiry", () => {
    expect(isExpired(meta, new Date("2026-02-01T00:00:00.000Z"))).toBe(true);
  });

  it("treats a missing or unparsable expiry as expired", () => {
    // Fail closed: a malformed meta.json must not hand out an eternal link.
    expect(isExpired({}, new Date())).toBe(true);
    expect(isExpired({ expiresAt: "whenever" }, new Date())).toBe(true);
    expect(isExpired(null, new Date())).toBe(true);
  });
});

describe("status transitions", () => {
  it("allows only pending → sent → signed", () => {
    expect(canTransition(STATUS.PENDING, STATUS.SENT)).toBe(true);
    expect(canTransition(STATUS.SENT, STATUS.SIGNED)).toBe(true);
  });

  it("refuses to sign twice", () => {
    expect(canTransition(STATUS.SIGNED, STATUS.SIGNED)).toBe(false);
    expect(() => assertTransition(STATUS.SIGNED, STATUS.SIGNED)).toThrow();
  });

  it("refuses to sign a proposal whose PDF never finished uploading", () => {
    expect(canTransition(STATUS.PENDING, STATUS.SIGNED)).toBe(false);
  });

  it("refuses to move backwards", () => {
    expect(canTransition(STATUS.SENT, STATUS.PENDING)).toBe(false);
    expect(canTransition(STATUS.SIGNED, STATUS.SENT)).toBe(false);
  });

  it("refuses unknown statuses", () => {
    expect(canTransition("bogus", STATUS.SENT)).toBe(false);
    expect(canTransition(STATUS.SENT, "bogus")).toBe(false);
  });

  it("carries the offending statuses in the thrown error", () => {
    expect(() => assertTransition(STATUS.SIGNED, STATUS.SENT)).toThrow(
      /signed.*sent/i,
    );
  });
});
