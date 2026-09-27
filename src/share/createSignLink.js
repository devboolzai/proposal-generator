import { uploadChunked } from "./uploadChunked";
import { buildFileName, generatePdf } from "../exportPdf";
import { generateDocx } from "../exportDocx";
import { ApiError, postJson } from "./api";

// ============================================================
// Turning the on-screen proposal into a signing link.
//
// Three server calls: the browser mints a record, uploads the
// bytes in 5MB chunks to /api/proposal-upload (each chunk retried
// on its own, so a flaky connection does not restart the whole
// upload), then tells the server the upload landed.
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
  const { token } = await postJson(
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
    await uploadChunked({
      blob,
      token,
      kind: "pdf",
      accessCode,
      onProgress: (pct) => onProgress(`מעלה את ההצעה… ${pct}%`),
    });
  } catch (err) {
    throw new ApiError(err?.message || "העלאת הקובץ נכשלה", 0);
  }

  // The Word original goes up too, so the archive can hand back an editable
  // document and not only a raster. It is built from the live form state, so
  // a manually supplied PDF still gets one — the two simply won't match, which
  // is the accepted cost of overriding the generated document.
  //
  // Has to happen before proposal-ready: proposal-upload refuses to write to a
  // record that has left `pending`.
  //
  // Never fatal. The client's document and their link are already in place;
  // losing the archive copy is not worth failing a send the salesperson is
  // watching. The archive shows DOC as unavailable for that proposal instead.
  if (sections) {
    onProgress("מעלה עותק Word…");
    try {
      const { blob: docxBlob } = await generateDocx(
        proposalData,
        sections,
        notes ?? [],
        proposalId,
        { returnBlob: true },
      );
      await uploadChunked({ blob: docxBlob, token, kind: "docx", accessCode });
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
