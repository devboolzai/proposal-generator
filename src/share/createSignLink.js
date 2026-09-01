import { upload } from "@vercel/blob/client";
import { generatePdf } from "../exportPdf";
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
 * @param {string} args.clientEmail     where the invitation goes
 * @param {number} args.expiresInDays
 * @param {string} args.accessCode
 * @param {(stage: string) => void} [args.onProgress]  Hebrew status line for the modal
 * @returns {Promise<{token: string, signUrl: string, expiresAt: string, fileName: string}>}
 */
export async function createSignLink({
  proposalData,
  clientEmail,
  expiresInDays,
  accessCode,
  onProgress = () => {},
}) {
  // generatePdf reads the live DOM, so #proposal-preview has to still be
  // mounted and visible — the modal is an overlay for exactly this reason.
  onProgress("מייצר את קובץ ה-PDF…");
  const { blob, fileName } = await generatePdf(proposalData, { returnBlob: true });

  onProgress("יוצר קישור…");
  const { token, pathname } = await postJson(
    "/api/proposal-create",
    {
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
