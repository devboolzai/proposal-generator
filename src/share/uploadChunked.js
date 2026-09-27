import { ApiError } from "./api";

// ============================================================
// Sends a Blob to /api/proposal-upload in pieces.
//
// The file is a page-per-JPEG raster of up to 30MB and the
// salesperson sending it is usually tethered to a phone. One
// long POST on that connection fails often, and when it fails it
// loses everything. Chunks fail small and retry small.
//
// The server writes each chunk at the offset named in the query
// string, so a retry rewrites the same bytes instead of
// appending them a second time — which is what makes retrying
// safe rather than corrupting.
// ============================================================

const CHUNK_BYTES = 5 * 1024 * 1024;
const ATTEMPTS_PER_CHUNK = 4;
const BACKOFF_MS = 800;

/** Statuses the server will answer the same way however many times we ask. */
const FINAL_STATUSES = new Set([400, 401, 404, 409, 413]);

export async function uploadChunked({ blob, token, kind, accessCode, onProgress }) {
  const total = blob.size;

  for (let offset = 0; offset < total || offset === 0; offset += CHUNK_BYTES) {
    const end = Math.min(offset + CHUNK_BYTES, total);
    const isFinal = end >= total;

    await sendChunk({
      slice: blob.slice(offset, end),
      offset,
      isFinal,
      token,
      kind,
      accessCode,
    });

    onProgress?.(Math.round((end / Math.max(total, 1)) * 100));
    if (isFinal) return;
  }
}

async function sendChunk({ slice, offset, isFinal, token, kind, accessCode }) {
  const params = new URLSearchParams({ token, kind, offset: String(offset) });
  if (isFinal) params.set("final", "1");
  const url = `/api/proposal-upload?${params}`;

  let lastError;

  for (let attempt = 0; attempt < ATTEMPTS_PER_CHUNK; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/octet-stream",
          "x-app-code": accessCode,
        },
        body: slice,
      });

      if (response.ok) return;

      const payload = await response.json().catch(() => ({}));
      const error = new ApiError(payload.error || "העלאת הקובץ נכשלה", response.status);

      // A 409 or a 413 means the same thing next time. Only a transport
      // failure or a 5xx is worth asking again.
      if (FINAL_STATUSES.has(response.status)) throw error;
      lastError = error;
    } catch (err) {
      if (err instanceof ApiError && FINAL_STATUSES.has(err.status)) throw err;
      lastError = err;
    }

    await new Promise((resolve) => setTimeout(resolve, BACKOFF_MS * (attempt + 1)));
  }

  // A server that kept answering 5xx has a message worth showing. A transport
  // failure's message is the browser's English ("Failed to fetch"), so the
  // salesperson gets the Hebrew one instead.
  throw lastError instanceof ApiError ? lastError : new ApiError("העלאת הקובץ נכשלה", 0);
}
