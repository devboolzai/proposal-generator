// ============================================================
// BOOLZAI EMAIL CHROME
//
// Both projects send branded Hebrew mail, so the shell lives here
// rather than in either one. It is pure string building with no
// dependencies and is never bundled into a browser build — only
// the serverless functions import it.
//
// Table layout and inline styles are deliberate: Outlook and
// Gmail still ignore <style> blocks and flex.
// ============================================================

const PURPLE = "#460093";
const PURPLE_SOFT = "#8360B8";
const CREAM = "#FDF8F1";
const INK = "#1A1A1A";

const FONT_STACK =
  "'Segoe UI', Arial, 'Helvetica Neue', Helvetica, sans-serif";

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** dd/mm/yyyy — the format the proposals themselves already use. */
export function formatDateHe(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

/**
 * @param {object} opts
 * @param {string} opts.heading      the big line at the top
 * @param {string[]} opts.paragraphs plain text, escaped here
 * @param {{label: string, url: string}} [opts.cta]
 * @param {string} [opts.note]       small print under the button
 */
export function renderEmail({ heading, paragraphs = [], cta, note }) {
  const body = paragraphs
    .map(
      (text) =>
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:${INK};">${escapeHtml(
          text,
        )}</p>`,
    )
    .join("");

  const button = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0;">
         <tr><td style="border-radius:10px;background:${PURPLE};">
           <a href="${escapeHtml(cta.url)}"
              style="display:inline-block;padding:14px 34px;font-family:${FONT_STACK};
                     font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;">
             ${escapeHtml(cta.label)}
           </a>
         </td></tr>
       </table>`
    : "";

  const smallPrint = note
    ? `<p style="margin:0;font-size:13px;line-height:1.6;color:#6b6b6b;">${escapeHtml(
        note,
      )}</p>`
    : "";

  return `<!doctype html>
<html lang="he" dir="rtl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${CREAM};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;
                    box-shadow:0 2px 12px rgba(70,0,147,0.08);">
        <tr><td style="height:6px;background:${PURPLE};font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:32px 30px 26px;font-family:${FONT_STACK};direction:rtl;text-align:right;">
          <h1 style="margin:0 0 18px;font-size:21px;font-weight:800;color:${PURPLE};">${escapeHtml(
            heading,
          )}</h1>
          ${body}
          ${button}
          ${smallPrint}
        </td></tr>
        <tr><td style="padding:18px 30px 26px;border-top:1px solid #eee;font-family:${FONT_STACK};
                       direction:rtl;text-align:right;font-size:12px;color:${PURPLE_SOFT};">
          Boolzai &nbsp;·&nbsp; <a href="https://www.boolzai.co.il"
             style="color:${PURPLE_SOFT};text-decoration:none;">www.boolzai.co.il</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/** Plain-text fallback, for clients that refuse HTML. */
export function renderPlain({ heading, paragraphs = [], cta, note }) {
  return [
    heading,
    "",
    ...paragraphs,
    cta ? `\n${cta.label}: ${cta.url}` : "",
    note ? `\n${note}` : "",
    "\n—\nBoolzai · www.boolzai.co.il",
  ]
    .filter(Boolean)
    .join("\n");
}
