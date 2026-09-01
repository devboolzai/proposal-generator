import { BRAND } from "./brand";

// ============================================================
// THE PAGE THAT GETS APPENDED TO THE PDF
//
// Rendered here, in the client's browser, and rasterised to PNG
// before it is sent. The server then only has to place an image.
//
// Why: pdf-lib cannot draw Hebrew without an embedded font and
// hand-reversed RTL runs — exactly the problem exportPdf.js
// already solved for the proposal itself by letting the browser
// do the typesetting. Same trick, same reason.
//
// It renders OFF-SCREEN rather than display:none, because
// html2canvas skips anything that isn't laid out.
// ============================================================

/** Fixed width so the raster is resolution-independent of the phone. */
export const BLOCK_WIDTH = 760;

export const CONSENT_TEXT =
  "אני מאשר/ת כי קראתי את הצעת המחיר במלואה, הבנתי את תוכנה ואת תנאיה, ואני מסכים/ה להם.";

export default function SignatureBlock({
  ref,
  proposal,
  signerName,
  signatureDataUrl,
  signedAt,
  token,
}) {
  return (
    <div
      ref={ref}
      style={{
        // Absolute rather than fixed: html2canvas measures a normally
        // positioned node reliably, which is the same reason exportPdf.js
        // captures the on-screen preview instead of a hidden clone.
        position: "absolute",
        top: 0,
        left: "-10000px",
        width: `${BLOCK_WIDTH}px`,
        background: "#fff",
        color: BRAND.ink,
        direction: "rtl",
        fontFamily: "var(--font-stack)",
        padding: "56px 60px",
        boxSizing: "border-box",
      }}
      aria-hidden="true"
    >
      <div
        style={{
          borderBottom: `3px solid ${BRAND.purple}`,
          paddingBottom: "14px",
          marginBottom: "28px",
        }}
      >
        <div style={{ fontSize: "26px", fontWeight: 700, color: BRAND.purple }}>
          אישור וחתימת הלקוח
        </div>
        {proposal?.subject && (
          <div style={{ fontSize: "16px", marginTop: "8px", color: "#444" }}>
            {proposal.subject}
          </div>
        )}
      </div>

      <Row label="שם החותם" value={signerName} />
      {proposal?.companyName && <Row label="חברה" value={proposal.companyName} />}
      <Row label="תאריך ושעה" value={formatStamp(signedAt)} />
      <Row label="מזהה מסמך" value={token?.slice(0, 12)} mono />

      <div style={{ fontSize: "15px", lineHeight: 1.9, margin: "26px 0 34px" }}>
        {CONSENT_TEXT}
      </div>

      <div style={{ fontSize: "14px", fontWeight: 700, marginBottom: "8px", color: "#555" }}>
        חתימה:
      </div>
      <div
        style={{
          border: `1px solid ${BRAND.rule}`,
          borderRadius: "8px",
          height: "200px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "10px",
          background: "#fff",
        }}
      >
        {signatureDataUrl && (
          <img
            src={signatureDataUrl}
            alt=""
            style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
          />
        )}
      </div>

      <div
        style={{
          marginTop: "34px",
          paddingTop: "14px",
          borderTop: `1px solid #ddd`,
          fontSize: "12px",
          color: BRAND.purpleSoft,
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>נחתם דיגיטלית באמצעות מערכת החתימות של Boolzai</span>
        <span>www.boolzai.co.il</span>
      </div>
    </div>
  );
}

function Row({ label, value, mono }) {
  return (
    <div style={{ display: "flex", gap: "10px", fontSize: "16px", marginBottom: "12px" }}>
      <span style={{ fontWeight: 700, color: "#555", minWidth: "110px" }}>{label}:</span>
      <span style={mono ? { fontFamily: "monospace", direction: "ltr" } : undefined}>
        {value}
      </span>
    </div>
  );
}

/** dd/mm/yyyy HH:MM, always in Israel time regardless of the device locale. */
function formatStamp(date) {
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}
