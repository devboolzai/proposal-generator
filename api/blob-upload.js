import { handleUpload } from "@vercel/blob/client";
import { DOCX_CONTENT_TYPE, STATUS, paths } from "../shared/proposal.js";
import { readMeta } from "./_lib/store.js";
import { allowMethod, fail, readBody, requireAccessCode, sendJson } from "../shared/http.js";

// POST /api/blob-upload
//
// Step 2 of 3. The proposal PDF is a page-per-JPEG raster and routinely
// exceeds the 4.5MB function body limit, so the browser uploads it straight
// to Blob and this route only mints the short-lived token that authorises
// that one upload.
//
// Note there is no onUploadCompleted: that webhook never fires under
// `vercel dev`, which would make the whole flow untestable locally. The
// browser calls /api/proposal-ready instead once upload() resolves.

const MAX_PDF_BYTES = 30 * 1024 * 1024;
// The Word file is text plus one cover JPEG — orders of magnitude under the
// raster it accompanies, so it gets its own, much tighter ceiling.
const MAX_DOCX_BYTES = 10 * 1024 * 1024;

export default async function handler(req, res) {
  if (!allowMethod(req, res, "POST")) return;

  const body = readBody(req);

  // handleUpload serves two different callers: the browser asking for a token,
  // and Vercel Blob reporting completion. Only the former is ours to guard.
  if (body?.type === "blob.generate-client-token" && !requireAccessCode(req, res)) {
    return;
  }

  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        const { token, kind } = uploadTarget(pathname);
        const meta = await readMeta(token);

        if (!meta) {
          throw new Error("ההצעה לא נמצאה");
        }
        // Only a record still waiting for its documents may be written to. Once
        // a proposal is live — let alone signed — they are frozen.
        if (meta.status !== STATUS.PENDING) {
          throw new Error("לא ניתן להעלות קובץ להצעה שכבר נשלחה");
        }

        return {
          allowedContentTypes:
            kind === "docx" ? [DOCX_CONTENT_TYPE] : ["application/pdf"],
          maximumSizeInBytes: kind === "docx" ? MAX_DOCX_BYTES : MAX_PDF_BYTES,
          addRandomSuffix: false,
          // Lets a retry after a failed upload reuse the same token.
          allowOverwrite: true,
        };
      },
    });

    sendJson(res, 200, result);
  } catch (err) {
    fail(res, err, 400);
  }
}

/**
 * The client picks the pathname, so it is untrusted input. Accept exactly the
 * two shapes this flow ever needs — the signable PDF and the archived Word
 * original — and derive the token from it rather than trusting a separately
 * supplied one.
 *
 * Note `signed` is deliberately not reachable: only the signing app may write
 * that, and only from bytes it produced itself.
 */
export function uploadTarget(pathname) {
  const token = pathname?.split("/")[1];
  if (!token) throw new Error("נתיב העלאה לא חוקי");

  // paths() throws on a token that could escape the prefix, so this is also
  // where a traversal attempt dies.
  const key = paths(token);
  if (pathname === key.original) return { token, kind: "original" };
  if (pathname === key.docx) return { token, kind: "docx" };

  throw new Error("נתיב העלאה לא חוקי");
}
