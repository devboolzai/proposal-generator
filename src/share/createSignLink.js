import { upload } from "@vercel/blob/client";
import { buildFileName, generatePdf } from "../exportPdf";
import { ApiError, postJson } from "./api";

// ============================================================
// Turning the on-screen proposal into a signing link.
//
// Three server calls rather than one, because the PDF cannot go
// through a function: it is a page-per-JPEG raster and would
// blow the 4.5MB body limit. So the browser mints a record,
// uploads the bytes straight to Blob, and then tells the server
// the upload landed.
//
// The modal owns the UI; this owns the sequence.
// ============================================================

export const EXPIRY_OPTIONS = [
  { days: 7, label: "שבוע" },
  { days: 14, label: "שבועיים" },
  { days: 30, label: "30 יום" },
];

export const DEFAULT_EXPIRY_DAYS = 30;

/**
 * @param {object} args
 * @param {object} args.proposalData    the live proposal state
 * @param {number} args.proposalId      allocated when the preview opened
 * @param {string} args.clientEmail     where the invitation goes
 * @param {number} args.expiresInDays
 * @param {string} args.accessCode
 * @param {File|null} [args.pdfFile]  a PDF to send instead of capturing the
 *        preview. When given, nothing is rasterised — the file is sent as-is,
 *        so whoever supplies it owns getting the proposal number onto the page.
 * @param {(stage: string) => void} [args.onProgress]  Hebrew status line for the modal
 * @returns {Promise<{token: string, signUrl: string, expiresAt: string, fileName: string}>}
 */
export async function createSignLink({
  proposalData,
  proposalId,
  clientEmail,
  expiresInDays,
  accessCode,
  pdfFile = null,
  onProgress = () => {},
}) {
  // Either the salesperson supplied the document, or we capture the preview.
  // Both paths converge on a blob plus a file name; nothing downstream knows
  // or cares which one produced them.
  let blob;
  let fileName;

  if (pdfFile) {
    onProgress("מכין את הקובץ שהועלה…");
    blob = pdfFile;
    // Deliberately not pdfFile.name: filing by proposal number only works if
    // every proposal follows the same convention.
    fileName = buildFileName(proposalData, proposalId);
  } else {
    // generatePdf reads the live DOM, so #proposal-preview has to still be
    // mounted and visible — the modal is an overlay for exactly this reason.
    // The number is already painted into that DOM, so the captured PDF carries
    // it; what goes to the server below is the same number, for the record.
    onProgress("מייצר את קובץ ה-PDF…");
    ({ blob, fileName } = await generatePdf(proposalData, proposalId, {
      returnBlob: true,
    }));
  }

  onProgress("יוצר קישור…");
  const { token, pathname } = await postJson(
    "/api/proposal-create",
    {
      proposalId,
      clientName: proposalData.clientName,
      companyName: proposalData.companyName,
      subject: proposalData.subject,
      clientEmail,
      fileName,
      expiresInDays,
    },
    accessCode,
  );

  onProgress("מעלה את ההצעה…");
  try {
    await upload(pathname, blob, {
      access: "private",
      contentType: "application/pdf",
      handleUploadUrl: "/api/blob-upload",
      headers: { "x-app-code": accessCode },
      // Splits large rasters into parallel parts and retries the ones that fail,
      // which matters on the phone tethering a salesperson tends to be on.
      multipart: true,
    });
  } catch (err) {
    throw new ApiError(err?.message || "העלאת הקובץ נכשלה", 0);
  }

  onProgress("מסיים…");
  const { signUrl, expiresAt } = await postJson("/api/proposal-ready", { token }, accessCode);

  return { token, signUrl, expiresAt, fileName };
}

/** Emails the client their invitation. Safe to call again to re-send. */
export async function emailSignLink({ token, accessCode }) {
  return postJson("/api/proposal-send-link", { token }, accessCode);
}
