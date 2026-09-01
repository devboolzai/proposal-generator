import { useEffect, useRef, useState } from "react";
import { BRAND, styles } from "./brand";
import { ApiError, fetchProposal, pdfUrl, submitSignature } from "./api";
import SignaturePad from "./SignaturePad";
import SignatureBlock, { BLOCK_WIDTH, CONSENT_TEXT } from "./SignatureBlock";
import { blockToPng, waitForNode } from "./rasterize";

// ============================================================
// THE CLIENT'S PAGE
//
// One screen, several states. Deliberately knows nothing about
// the proposal generator: this is a separate deployment so that
// a client who trims the URL finds nothing of ours.
// ============================================================

// iOS Safari and Android Chrome hand PDFs to a native viewer instead of
// rendering them in an iframe, leaving a blank box. On those, lead with the
// open button rather than pretending the embed works.
const PREFERS_NATIVE_PDF = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

export default function SignPage({ token }) {
  const [phase, setPhase] = useState(token ? "loading" : "invalid");
  const [proposal, setProposal] = useState(null);
  const [loadError, setLoadError] = useState(null);

  const [signerName, setSignerName] = useState("");
  const [consent, setConsent] = useState(false);
  const [hasInk, setHasInk] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [mailed, setMailed] = useState(true);

  const [capture, setCapture] = useState(null);
  const padRef = useRef(null);
  const blockRef = useRef(null);

  useEffect(() => {
    if (!token) return;
    let live = true;
    fetchProposal(token)
      .then((data) => {
        if (!live) return;
        setProposal(data);
        setPhase(data.status === "signed" ? "already" : "ready");
      })
      .catch((err) => {
        if (!live) return;
        setLoadError(err.message);
        setPhase(err.status === 410 ? "expired" : err.status === 404 ? "missing" : "failed");
      });
    return () => {
      live = false;
    };
  }, [token]);

  const canSubmit = signerName.trim().length >= 2 && consent && hasInk;

  const handleSign = async () => {
    setSubmitError(null);
    const signatureDataUrl = padRef.current?.toDataURL();
    if (!signatureDataUrl) {
      setSubmitError("יש לחתום בתיבת החתימה לפני השליחה");
      return;
    }

    setPhase("submitting");
    try {
      // Feed the block the final values, let React paint it, then rasterise.
      setCapture({ signatureDataUrl, signedAt: new Date() });
      const node = await waitForNode(() => blockRef.current);

      const signatureBlockPng = await blockToPng(node, BLOCK_WIDTH);

      const result = await submitSignature({
        token,
        signerName: signerName.trim(),
        consent: true,
        signatureBlockPng,
      });

      setMailed(result.mailed !== false);
      setPhase("done");
    } catch (err) {
      // A 409 means the signature already landed — most likely this is a retry
      // after a dropped response. Showing an error would be a lie, and would
      // invite an attempt that can never succeed.
      if (err.status === 409) {
        setPhase("already");
        return;
      }
      setSubmitError(
        err instanceof ApiError ? err.message : "שליחת החתימה נכשלה. יש לנסות שוב.",
      );
      setPhase("ready");
    }
  };

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.headerTitle}>Boolzai</h1>
        <span style={styles.headerSub}>חתימה על הצעת מחיר</span>
      </header>

      <main style={styles.main}>
        {phase === "loading" && <Message text="טוען את ההצעה…" />}

        {phase === "invalid" && (
          <Message
            title="קישור לא תקין"
            text="הכתובת אינה שלמה. יש להשתמש בקישור המלא שנשלח במייל."
          />
        )}

        {phase === "missing" && (
          <Message
            title="ההצעה לא נמצאה"
            text="ייתכן שהקישור שגוי או שההצעה הוסרה. כדאי לפנות אלינו לקבלת קישור חדש."
          />
        )}

        {phase === "expired" && (
          <Message
            title="תוקף הקישור פג"
            text="הקישור לחתימה כבר אינו בתוקף. נשמח לשלוח לכם הצעה מעודכנת — צרו איתנו קשר."
          />
        )}

        {phase === "failed" && <Message title="אירעה שגיאה" text={loadError} />}

        {phase === "already" && (
          <>
            <Message
              title="ההצעה כבר נחתמה"
              text="תודה! ההצעה נחתמה ואין צורך בפעולה נוספת."
            />
            <DownloadSigned token={token} />
          </>
        )}

        {phase === "done" && (
          <>
            <div style={{ ...styles.card, borderColor: "rgba(34,150,80,0.4)" }}>
              <div style={{ fontSize: "22px", fontWeight: 800, color: "#1f7a45", marginBottom: "10px" }}>
                ✓ תודה, ההצעה נחתמה
              </div>
              <p style={styles.note}>
                {mailed
                  ? "עותק חתום נשלח אליכם ואלינו במייל."
                  : "החתימה נקלטה ונשמרה. שליחת המייל נתקלה בתקלה זמנית ואנחנו נטפל בכך."}
              </p>
            </div>
            <DownloadSigned token={token} />
          </>
        )}

        {(phase === "ready" || phase === "submitting") && proposal && (
          <>
            <div style={styles.card}>
              <div style={styles.cardTitle}>
                {proposal.subject || "הצעת מחיר"}
              </div>
              <p style={styles.note}>
                {proposal.clientName ? `שלום ${proposal.clientName}, ` : ""}
                לפניכם הצעת המחיר{proposal.companyName ? ` עבור ${proposal.companyName}` : ""}.
                יש לקרוא אותה במלואה ולחתום בתחתית העמוד.
              </p>
            </div>

            <PdfViewer token={token} />

            <div style={styles.card}>
              <div style={styles.cardTitle}>חתימה</div>

              <div style={{ marginBottom: "18px" }}>
                <label style={styles.label} htmlFor="signer-name">
                  שם מלא של החותם/ת
                </label>
                <input
                  id="signer-name"
                  style={styles.input}
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  placeholder="שם פרטי ושם משפחה"
                  disabled={phase === "submitting"}
                  autoComplete="name"
                />
              </div>

              <label style={styles.label}>חתימה</label>
              <SignaturePad
                ref={padRef}
                onChange={setHasInk}
                disabled={phase === "submitting"}
              />

              <label
                style={{
                  display: "flex",
                  gap: "10px",
                  alignItems: "flex-start",
                  margin: "20px 0",
                  cursor: "pointer",
                  fontSize: "14px",
                  lineHeight: 1.7,
                }}
              >
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  disabled={phase === "submitting"}
                  style={{ width: "20px", height: "20px", marginTop: "2px", flexShrink: 0, accentColor: BRAND.purple }}
                />
                <span>{CONSENT_TEXT}</span>
              </label>

              {submitError && <div style={errorBox}>{submitError}</div>}

              <button
                style={{
                  ...styles.btn("lg"),
                  width: "100%",
                  opacity: canSubmit && phase !== "submitting" ? 1 : 0.45,
                }}
                onClick={handleSign}
                disabled={!canSubmit || phase === "submitting"}
              >
                {phase === "submitting" ? "⏳ שולח…" : "אישור וחתימה"}
              </button>

              <p style={{ ...styles.note, fontSize: "12px", marginTop: "12px", textAlign: "center" }}>
                לאחר החתימה יישלח אליכם עותק חתום במייל.
              </p>
            </div>
          </>
        )}
      </main>

      <footer style={styles.footer}>
        © Boolzai · <a href="https://www.boolzai.co.il" style={{ color: BRAND.purpleSoft }}>www.boolzai.co.il</a>
      </footer>

      {/* Off-screen, and only mounted once there is something to capture. */}
      {capture && (
        <SignatureBlock
          ref={blockRef}
          proposal={proposal}
          token={token}
          signerName={signerName.trim()}
          signatureDataUrl={capture.signatureDataUrl}
          signedAt={capture.signedAt}
        />
      )}
    </div>
  );
}

function PdfViewer({ token }) {
  const url = pdfUrl(token);
  const openButton = (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      style={{ ...styles.btn(PREFERS_NATIVE_PDF ? "lg" : undefined), display: "inline-block", textDecoration: "none", textAlign: "center" }}
    >
      📄 פתיחת ההצעה
    </a>
  );

  if (PREFERS_NATIVE_PDF) {
    return (
      <div style={{ ...styles.card, textAlign: "center" }}>
        <div style={styles.cardTitle}>ההצעה המלאה</div>
        <p style={{ ...styles.note, marginBottom: "16px" }}>
          יש לפתוח ולקרוא את ההצעה לפני החתימה. היא תיפתח בכרטיסייה חדשה.
        </p>
        {openButton}
      </div>
    );
  }

  return (
    <div style={styles.card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", gap: "12px", flexWrap: "wrap" }}>
        <div style={{ ...styles.cardTitle, marginBottom: 0 }}>ההצעה המלאה</div>
        {openButton}
      </div>
      <iframe
        src={url}
        title="הצעת מחיר"
        style={{ width: "100%", height: "70vh", minHeight: "460px", border: "1px solid rgba(70,0,147,0.15)", borderRadius: "10px", background: "#fff" }}
      />
    </div>
  );
}

function DownloadSigned({ token }) {
  return (
    <div style={{ textAlign: "center" }}>
      <a
        href={`${pdfUrl(token)}&download=1`}
        style={{ ...styles.btn(), display: "inline-block", textDecoration: "none" }}
      >
        ⬇ הורדת העותק החתום
      </a>
    </div>
  );
}

function Message({ title, text }) {
  return (
    <div style={{ ...styles.card, textAlign: "center" }}>
      {title && <div style={{ ...styles.cardTitle, fontSize: "19px" }}>{title}</div>}
      <p style={styles.note}>{text}</p>
    </div>
  );
}

const errorBox = {
  marginBottom: "16px",
  padding: "11px 14px",
  borderRadius: "9px",
  background: "rgba(220,38,38,0.08)",
  border: "1px solid rgba(220,38,38,0.35)",
  color: "#b91c1c",
  fontSize: "14px",
};
