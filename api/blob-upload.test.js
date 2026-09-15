import { describe, it, expect } from "vitest";
import { uploadTarget } from "./blob-upload.js";
import { paths } from "../shared/proposal.js";

// The pathname is chosen by the browser, so this function is the boundary
// between untrusted input and a real Blob write. Everything it lets through
// gets an upload token.

describe("uploadTarget", () => {
  const token = "a".repeat(32);
  const key = paths(token);

  it("accepts the signable PDF", () => {
    expect(uploadTarget(key.original)).toEqual({ token, kind: "original" });
  });

  it("accepts the archived Word original", () => {
    expect(uploadTarget(key.docx)).toEqual({ token, kind: "docx" });
  });

  it("refuses the signed copy", () => {
    // Only the signing app may write that, and only from bytes it produced
    // itself — a browser that could overwrite it could forge a signature.
    expect(() => uploadTarget(key.signed)).toThrow();
  });

  it("refuses the record itself", () => {
    // Writable meta.json would let a client set their own status or expiry.
    expect(() => uploadTarget(key.meta)).toThrow();
  });

  it("refuses anything outside one proposal's folder", () => {
    expect(() => uploadTarget("counters/proposal-id.json")).toThrow();
    expect(() => uploadTarget(`proposals/${token}/../../evil.pdf`)).toThrow();
    expect(() => uploadTarget("proposals/short/original.pdf")).toThrow();
    expect(() => uploadTarget("")).toThrow();
    expect(() => uploadTarget(undefined)).toThrow();
  });
});
