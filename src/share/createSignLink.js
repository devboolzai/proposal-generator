import { upload } from "@vercel/blob/client";
import { buildFileName, generatePdf } from "../exportPdf";
import { generateDocx } from "../exportDocx";
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

// Mirrors DOCX_CONTENT_TYPE in shared/proposal.js, which cannot be imported
// here: that module pulls in node:crypto and so never enters a browser bundle.
// blob-upload.js checks the value against its own copy, so a drift fails loudly
// at upload time rather than quietly storing the wrong type.
const DOCX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

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
 * @param {Array} args.sections     preview content, for the archived Word copy
 * @param {string[]} args.notes     the notes as shown, for the same
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
  sections = null,
  notes = null,
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
  const { token, pathname, docxPathname } = await postJson(
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

  // The Word original goes up too, so the archive can hand back an editable
  // document and not only a raster. It is built from the live form state, so
  // a manually supplied PDF still gets one — the two simply won't match, which
  // is the accepted cost of overriding the generated document.
  //
  // Has to happen before proposal-ready: blob-upload refuses to write to a
  // record that has left `pending`.
  //
  // Never fatal. The client's document and their link are already in place;
  // losing the archive copy is not worth failing a send the salesperson is
  // watching. The archive shows DOC as unavailable for that proposal instead.
  if (sections && docxPathname) {
    onProgress("מעלה עותק Word…");
    try {
      const { blob: docxBlob } = await generateDocx(
        proposalData,
        sections,
        notes ?? [],
        proposalId,
        { returnBlob: true },
      );
      await upload(docxPathname, docxBlob, {
        access: "private",
        contentType: DOCX_CONTENT_TYPE,
        handleUploadUrl: "/api/blob-upload",
        headers: { "x-app-code": accessCode },
      });
    } catch (err) {
      console.error("docx archive upload failed", err);
    }
  }

  onProgress("מסיים…");
  const { signUrl, expiresAt } = await postJson("/api/proposal-ready", { token }, accessCode);

  return { token, signUrl, expiresAt, fileName };
}

/** Emails the client their invitation. Safe to call again to re-send. */
export async function emailSignLink({ token, accessCode }) {
  return postJson("/api/proposal-send-link", { token }, accessCode);
}
