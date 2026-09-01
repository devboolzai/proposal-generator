import { Resend } from "resend";
import {
  formatDateHe,
  renderEmail,
  renderPlain,
} from "../../shared/emailTemplate.js";

// ============================================================
// The invitation email: "here is your proposal, please sign".
//
// Everything Resend-specific is confined to this file so that
// swapping provider later is a one-file change.
//
// The PDF is deliberately NOT attached. The client reads the
// proposal on the signing page, which guarantees the document
// they sign is the one on file rather than a copy that happened
// to land in their inbox.
// ============================================================

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

export async function sendSignLink({ meta, signUrl }) {
  const greeting = meta.clientName ? `שלום ${meta.clientName},` : "שלום,";
  const forCompany = meta.companyName ? ` עבור ${meta.companyName}` : "";
  const subjectLine = meta.subject
    ? `הצעת מחיר – ${meta.subject}`
    : "הצעת מחיר מ-Boolzai";

  const content = {
    heading: subjectLine,
    paragraphs: [
      greeting,
      `הצעת המחיר${forCompany} מוכנה לעיון ולחתימה.`,
      "בלחיצה על הכפתור תגיעו לעמוד מאובטח שבו תוכלו לקרוא את ההצעה במלואה ולחתום עליה דיגיטלית, ישירות מהטלפון או מהמחשב.",
    ],
    cta: { label: "לצפייה ולחתימה על ההצעה", url: signUrl },
    note: `הקישור אישי ותקף עד ${formatDateHe(meta.expiresAt)}. אם ההצעה אינה רלוונטית, אפשר פשוט להתעלם מההודעה.`,
  };

  const { data, error } = await resend().emails.send({
    from: from(),
    to: [meta.clientEmail],
    subject: subjectLine,
    html: renderEmail(content),
    text: renderPlain(content),
  });

  // Resend reports failures in the payload rather than by throwing.
  if (error) throw new Error(error.message || "שליחת המייל נכשלה");
  return data;
}
