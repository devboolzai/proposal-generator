import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { uploadChunked } from "./uploadChunked.js";

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function blobOf(size) {
  return new Blob([new Uint8Array(size)]);
}

describe("uploadChunked", () => {
  it("sends one request for a blob smaller than a chunk, marked final", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    await uploadChunked({ blob: blobOf(100), token: "t", kind: "pdf", accessCode: "c" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(fetchMock.mock.calls[0][0], "http://x");
    expect(url.searchParams.get("offset")).toBe("0");
    expect(url.searchParams.get("final")).toBe("1");
  });

  it("splits a large blob and marks only the last chunk final", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    const chunk = 5 * 1024 * 1024;
    await uploadChunked({ blob: blobOf(chunk * 2 + 10), token: "t", kind: "pdf", accessCode: "c" });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const finals = fetchMock.mock.calls.map(
      ([u]) => new URL(u, "http://x").searchParams.get("final"),
    );
    expect(finals).toEqual([null, null, "1"]);
  });

  it("retries a failed chunk at the same offset rather than restarting", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    const done = uploadChunked({ blob: blobOf(100), token: "t", kind: "pdf", accessCode: "c" });
    await vi.runAllTimersAsync();
    await done;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const offsets = fetchMock.mock.calls.map(
      ([u]) => new URL(u, "http://x").searchParams.get("offset"),
    );
    expect(offsets).toEqual(["0", "0"]);
  });

  it("gives up after the retry budget and throws", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockRejectedValue(new Error("network"));
    vi.stubGlobal("fetch", fetchMock);

    const done = expect(
      uploadChunked({ blob: blobOf(100), token: "t", kind: "pdf", accessCode: "c" }),
    ).rejects.toThrow(/העלאת הקובץ נכשלה/);
    await vi.runAllTimersAsync();
    await done;
  });

  it("does not retry a refusal the server will repeat", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: "לא ניתן להעלות קובץ להצעה שכבר נשלחה" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      uploadChunked({ blob: blobOf(100), token: "t", kind: "pdf", accessCode: "c" }),
    ).rejects.toThrow(/כבר נשלחה/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
