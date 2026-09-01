import { handleUpload } from "@vercel/blob/client";
import { STATUS, paths } from "../shared/proposal.js";
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
        const token = tokenFromOriginalPath(pathname);
        const meta = await readMeta(token);

        if (!meta) {
          throw new Error("ההצעה לא נמצאה");
        }
        // Only a record still waiting for its PDF may be written to. Once a
        // proposal is live — let alone signed — the document is frozen.
        if (meta.status !== STATUS.PENDING) {
          throw new Error("לא ניתן להעלות קובץ להצעה שכבר נשלחה");
        }

        return {
          allowedContentTypes: ["application/pdf"],
          maximumSizeInBytes: MAX_PDF_BYTES,
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
 * one shape this flow ever needs, and derive the token from it rather than
 * trusting a separately supplied one.
 */
function tokenFromOriginalPath(pathname) {
  const token = pathname?.split("/")[1];
  if (!token || pathname !== paths(token).original) {
    throw new Error("נתיב העלאה לא חוקי");
  }
  return token;
}
