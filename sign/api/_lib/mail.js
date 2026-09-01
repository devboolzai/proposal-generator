import { Resend } from "resend";
import {
  formatDateHe,
  renderEmail,
  renderPlain,
} from "../../../shared/emailTemplate.js";

// ============================================================
// The two emails that go out the moment a proposal is signed:
// a thank-you to the client and a notification to Boolzai.
//
// Separate messages rather than one with both addresses in the
// To field — the client should not see internal recipients, and
// the two audiences want to read different things.
// ============================================================

// Resend accepts up to 40MB, but mail that large is routinely bounced or
// stripped at the receiving end. Past this, send a link instead.
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

let client;

function resend() {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured");
  }
  client ??= new Resend(process.env.RESEND_API_KEY);
  return client;
}

function from() {
  const value = process.env.MAIL_FROM;
  if (!value) throw new Error("MAIL_FROM is not configured");
  return value;
}

/**
 * @returns {Promise<boolean>} whether every message went out. The caller must
 *   not fail the signature on a false — the document is already stored.
 */
export async function sendSignedProposal({ meta, pdfBytes, fileName, downloadUrl }) {
  const tooBig = pdfBytes.byteLength > MAX_ATTACHMENT_BYTES;
  const attachments = tooBig
    ? undefined
    : [{ filename: fileName, content: Buffer.from(pdfBytes).toString("base64") }];

  const signedOn = formatDateHe(meta.signedAt);
  const subject = meta.subject || "הצעת מחיר";
  const owner = process.env.OWNER_EMAIL;

  const toClient = {
    heading: "תודה, ההצעה נחתמה",
    paragraphs: [
      meta.clientName ? `שלום ${meta.clientName},` : "שלום,",
      `הצעת המחיר "${subject}" נחתמה בהצלחה בתאריך ${signedOn}.`,
      tooBig
        ? "העותק החתום זמין להורדה בקישור המצורף."
        : "מצורף העותק החתום לשמירה בתיקייה שלכם.",
    ],
    cta: tooBig ? { label: "הורדת העותק החתום", url: downloadUrl } : undefined,
    note: "נשמח להתחיל לעבוד. ניצור איתכם קשר בקרוב.",
  };

  const toOwner = {
    heading: "הצעת מחיר נחתמה",
    paragraphs: [
      `${meta.clientName || "לקוח"}${meta.companyName ? ` (${meta.companyName})` : ""} חתם/ה על "${subject}".`,
      `שם החותם: ${meta.signerName}`,
      `אימייל: ${meta.clientEmail}`,
      `תאריך חתימה: ${signedOn}`,
      `כתובת IP: ${meta.signerIp || "לא נרשמה"}`,
    ],
    cta: { label: "צפייה בעותק החתום", url: downloadUrl },
  };

  const sends = [
    send({ to: meta.clientEmail, subject: `העותק החתום – ${subject}`, content: toClient, attachments }),
  ];
  if (owner) {
    sends.push(
      send({ to: owner, subject: `✍ נחתם: ${subject} – ${meta.clientName || ""}`, content: toOwner, attachments }),
    );
  }

  const results = await Promise.allSettled(sends);
  results
    .filter((r) => r.status === "rejected")
    .forEach((r) => console.error("signed-proposal mail failed", r.reason));

  return results.every((r) => r.status === "fulfilled");
}

async function send({ to, subject, content, attachments }) {
  const { error } = await resend().emails.send({
    from: from(),
    to: [to],
    subject,
    html: renderEmail(content),
    text: renderPlain(content),
    ...(attachments ? { attachments } : {}),
  });
  // Resend reports failures in the payload rather than by throwing.
  if (error) throw new Error(error.message || "send failed");
}
