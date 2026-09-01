import { useEffect, useRef, useState } from "react";
import { styles } from "../styles/appStyles";
import {
  DEFAULT_EXPIRY_DAYS,
  EXPIRY_OPTIONS,
  createSignLink,
  emailSignLink,
} from "../share/createSignLink";
import { getAccessCode, setAccessCode } from "../share/api";

// ============================================================
// "Send for signature" — the salesperson's side of the flow.
//
// Rendered as an overlay on purpose: generatePdf rasterises the
// live #proposal-preview node, so the preview underneath must
// stay mounted and visible while this is open. Never swap this
// in *instead of* the preview.
// ============================================================

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ShareLinkModal({ proposalData, onClose }) {
  const [clientEmail, setClientEmail] = useState("");
  const [expiresInDays, setExpiresInDays] = useState(DEFAULT_EXPIRY_DAYS);
  const [accessCode, setCode] = useState(getAccessCode);
  const [stage, setStage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [resend, setResend] = useState({ busy: false, note: null });
  const [copied, setCopied] = useState(false);
  const emailRef = useRef(null);

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const emailValid = EMAIL_PATTERN.test(clientEmail.trim());

  const handleCreate = async () => {
    setError(null);
    setBusy(true);
    try {
      const created = await createSignLink({
        proposalData,
        clientEmail: clientEmail.trim(),
        expiresInDays,
        accessCode: accessCode.trim(),
        onProgress: setStage,
      });
      setAccessCode(accessCode.trim());
      setResult(created);

      // The link exists and is copyable from here on. If the mail fails the
      // work is not lost — it becomes a "send again" the salesperson can retry.
      setStage("שולח מייל ללקוח…");
      try {
        await emailSignLink({ token: created.token, accessCode: accessCode.trim() });
        setResend({ busy: false, note: `נשלח אל ${clientEmail.trim()}` });
      } catch (mailErr) {
        setResend({
          busy: false,
          note: `הקישור נוצר, אך שליחת המייל נכשלה: ${mailErr.message}`,
        });
      }
    } catch (err) {
      setError(err.message || "יצירת הקישור נכשלה");
      // A rejected code is cleared by the api layer; drop it here too so the
      // field reappears instead of silently retrying the same wrong value.
      if (err.status === 401) setCode("");
    } finally {
      setBusy(false);
      setStage("");
    }
  };

  const handleResend = async () => {
    setResend({ busy: true, note: null });
    try {
      await emailSignLink({ token: result.token, accessCode: accessCode.trim() });
      setResend({ busy: false, note: `נשלח שוב אל ${clientEmail.trim()}` });
    } catch (err) {
      setResend({ busy: false, note: `שליחה נכשלה: ${err.message}` });
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(result.signUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is blocked outside HTTPS and in some browsers; the input is
      // readonly-but-selectable so the salesperson can still copy by hand.
      setResend({ busy: false, note: "לא ניתן להעתיק אוטומטית — יש לסמן ולהעתיק ידנית" });
    }
  };

  return (
    <div style={overlay} onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div style={panel} onMouseDown={(e) => e.stopPropagation()}>
        <div style={header}>
          <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 800, color: "#a5b4fc" }}>
            🔗 שליחה לחתימת הלקוח
          </h3>
          <button style={closeBtn} onClick={onClose} disabled={busy} aria-label="סגירה">
            ✕
          </button>
        </div>

        {!result ? (
          <>
            <p style={hint}>
              נייצר קובץ PDF של ההצעה, ניצור קישור אישי ונשלח אותו במייל ללקוח.
              הלקוח יוכל לקרוא ולחתום ישירות מהטלפון.
            </p>

            {!accessCode && (
              <div style={{ marginBottom: "16px" }}>
                <label style={styles.label}>קוד גישה</label>
                <input
                  style={styles.input}
                  type="password"
                  value={accessCode}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="קוד הגישה של המערכת"
                  autoComplete="off"
                />
              </div>
            )}

            <div style={{ marginBottom: "16px" }}>
              <label style={styles.label}>אימייל הלקוח</label>
              <input
                ref={emailRef}
                style={{ ...styles.input, direction: "ltr", textAlign: "left" }}
                type="email"
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
                placeholder="client@company.co.il"
                disabled={busy}
              />
            </div>

            <div style={{ marginBottom: "20px" }}>
              <label style={styles.label}>תוקף הקישור</label>
              <select
                style={styles.select}
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(Number(e.target.value))}
                disabled={busy}
              >
                {EXPIRY_OPTIONS.map(({ days, label }) => (
                  <option key={days} value={days}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            {error && <div style={errorBox}>{error}</div>}

            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-start" }}>
              <button
                style={{ ...styles.btn("primary"), opacity: busy || !emailValid || !accessCode ? 0.5 : 1 }}
                onClick={handleCreate}
                disabled={busy || !emailValid || !accessCode.trim()}
              >
                {busy ? `⏳ ${stage || "עובד…"}` : "צור ושלח ללקוח"}
              </button>
              <button style={styles.btn()} onClick={onClose} disabled={busy}>
                ביטול
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={successBox}>✓ הקישור נוצר בהצלחה</div>

            <label style={styles.label}>הקישור לשליחה</label>
            <input
              style={{ ...styles.input, direction: "ltr", textAlign: "left", marginBottom: "12px" }}
              value={result.signUrl}
              readOnly
              onFocus={(e) => e.target.select()}
            />

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "14px" }}>
              <button style={styles.btn("primary")} onClick={handleCopy}>
                {copied ? "✓ הועתק" : "📋 העתקת קישור"}
              </button>
              <button
                style={styles.btn()}
                onClick={() => window.open(result.signUrl, "_blank", "noopener")}
              >
                ↗ פתיחה
              </button>
              <button style={styles.btn()} onClick={handleResend} disabled={resend.busy}>
                {resend.busy ? "⏳ שולח…" : "✉ שליחה חוזרת במייל"}
              </button>
            </div>

            {resend.note && <div style={noteBox}>{resend.note}</div>}

            <p style={hint}>
              הקישור תקף עד {new Date(result.expiresAt).toLocaleDateString("he-IL")} וניתן לחתימה
              פעם אחת בלבד. לאחר החתימה יישלח אליכם ואל הלקוח עותק חתום.
            </p>

            <button style={styles.btn("primary")} onClick={onClose}>
              סיום
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const overlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(2,6,23,0.75)",
  backdropFilter: "blur(3px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "20px",
  zIndex: 1000,
};

const panel = {
  width: "100%",
  maxWidth: "480px",
  maxHeight: "90vh",
  overflowY: "auto",
  background: "#0f172a",
  border: "1px solid rgba(99,102,241,0.3)",
  borderRadius: "16px",
  padding: "24px",
  direction: "rtl",
  color: "#e2e8f0",
  boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
};

const header = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: "14px",
};

const closeBtn = {
  background: "transparent",
  border: "none",
  color: "#94a3b8",
  fontSize: "18px",
  cursor: "pointer",
  padding: "4px 8px",
};

const hint = {
  fontSize: "13px",
  lineHeight: 1.7,
  color: "#94a3b8",
  margin: "0 0 18px",
};

const errorBox = {
  marginBottom: "16px",
  padding: "10px 14px",
  borderRadius: "8px",
  background: "rgba(239,68,68,0.12)",
  border: "1px solid rgba(239,68,68,0.4)",
  color: "#fca5a5",
  fontSize: "13px",
};

const successBox = {
  marginBottom: "16px",
  padding: "10px 14px",
  borderRadius: "8px",
  background: "rgba(34,197,94,0.12)",
  border: "1px solid rgba(34,197,94,0.4)",
  color: "#86efac",
  fontSize: "14px",
  fontWeight: 600,
};

const noteBox = {
  marginBottom: "14px",
  padding: "9px 13px",
  borderRadius: "8px",
  background: "rgba(99,102,241,0.12)",
  border: "1px solid rgba(99,102,241,0.3)",
  color: "#c7d2fe",
  fontSize: "13px",
};
