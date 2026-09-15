import { useCallback, useEffect, useState } from "react";
import { styles } from "../styles/appStyles";
import {
  downloadFile,
  getAccessCode,
  getJson,
  setAccessCode,
} from "../share/api";

// ============================================================
// The archive — every proposal that was actually sent.
//
// Read-only on purpose. Nothing here can change a record: it
// lists what /api/proposals-list found in Blob and downloads
// the three files a proposal can have. A salesperson looking
// for "the one we sent that company in March" should not be
// able to break it while looking.
//
// The files are private blobs behind an access-code header, so
// every download goes through downloadFile rather than a link.
// ============================================================

const FILES = [
  { kind: "docx", label: "📄 DOC", has: "docx" },
  { kind: "original", label: "📕 PDF", has: "original" },
  { kind: "signed", label: "✍ PDF חתום", has: "signed" },
];

export default function ProposalsArchive({ onClose }) {
  const [accessCode, setCode] = useState(getAccessCode);
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  // Keyed by `${token}:${kind}` so two rows downloading at once each show
  // their own spinner rather than one freezing the whole list.
  const [busyFile, setBusyFile] = useState(null);

  const load = useCallback(async (code) => {
    const trimmed = code.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);
    try {
      const { proposals } = await getJson("/api/proposals-list", trimmed);
      setRows(proposals);
      // Only remember a code that actually worked, so a typo is not cached
      // and left to 401 the send flow later.
      setAccessCode(trimmed);
    } catch (err) {
      setError(err.message || "טעינת ההצעות נכשלה");
      if (err.status === 401) setCode("");
      setRows(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const stored = getAccessCode();
    if (stored) load(stored);
  }, [load]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleDownload = async (row, kind) => {
    const id = `${row.token}:${kind}`;
    setBusyFile(id);
    setError(null);
    try {
      await downloadFile(
        `/api/proposal-file?token=${encodeURIComponent(row.token)}&kind=${kind}`,
        accessCode.trim(),
      );
    } catch (err) {
      setError(err.message || "ההורדה נכשלה");
      if (err.status === 401) setCode("");
    } finally {
      setBusyFile(null);
    }
  };

  // Everything a person might half-remember about a proposal: what it was
  // about, who it went to, and the number they were given on the phone.
  const needle = query.trim().toLowerCase();
  const visible = !rows
    ? []
    : needle
      ? rows.filter((r) =>
          [r.subject, r.clientName, r.companyName, r.clientEmail, String(r.proposalId)]
            .join(" ")
            .toLowerCase()
            .includes(needle),
        )
      : rows;

  return (
    <div style={overlay} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div style={panel} onMouseDown={(e) => e.stopPropagation()}>
        <div style={header}>
          <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 800, color: "#a5b4fc" }}>
            📁 ארכיון הצעות שנשלחו
          </h3>
          <button style={closeBtn} onClick={onClose} aria-label="סגירה">
            ✕
          </button>
        </div>

        {!accessCode ? (
          <div style={{ marginBottom: "8px" }}>
            <label style={styles.label}>קוד גישה</label>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <input
                style={{ ...styles.input, flex: "1 1 200px", width: "auto" }}
                type="password"
                value={accessCode}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && load(accessCode)}
                placeholder="קוד הגישה של המערכת"
                autoComplete="off"
                autoFocus
              />
              <button
                style={styles.btn("primary")}
                onClick={() => load(accessCode)}
                disabled={!accessCode.trim() || loading}
              >
                הצגת הארכיון
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", gap: "8px", marginBottom: "14px", flexWrap: "wrap" }}>
            <input
              style={{ ...styles.input, flex: "1 1 220px", width: "auto", marginBottom: 0 }}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="חיפוש לפי הנדון, לקוח או מספר הצעה"
            />
            <button style={styles.btn()} onClick={() => load(accessCode)} disabled={loading}>
              {loading ? "⏳ טוען…" : "↻ רענון"}
            </button>
          </div>
        )}

        {error && <div style={errorBox}>{error}</div>}

        {loading && !rows && <div style={emptyBox}>⏳ טוען הצעות…</div>}

        {rows && visible.length === 0 && (
          <div style={emptyBox}>
            {rows.length === 0
              ? "עדיין לא נשלחה אף הצעה."
              : "לא נמצאה הצעה שמתאימה לחיפוש."}
          </div>
        )}

        {visible.map((row) => (
          <div key={row.token} style={rowBox}>
            <div style={rowTop}>
              <span style={rowSubject}>{row.subject || "ללא הנדון"}</span>
              <span style={rowId}>#{row.proposalId}</span>
            </div>

            <div style={rowMeta}>
              <span>{new Date(row.sentAt).toLocaleDateString("he-IL")}</span>
              <span style={dot}>•</span>
              <span>{row.companyName || row.clientName || row.clientEmail}</span>
              {row.status === "signed" && (
                <span style={signedTag}>
                  ✓ נחתם {row.signedAt && new Date(row.signedAt).toLocaleDateString("he-IL")}
                </span>
              )}
            </div>

            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {FILES.map(({ kind, label, has }) => {
                const available = row.has[has];
                const busy = busyFile === `${row.token}:${kind}`;
                return (
                  <button
                    key={kind}
                    style={{
                      ...styles.btn(),
                      padding: "6px 12px",
                      fontSize: "12px",
                      opacity: available && !busy ? 1 : 0.35,
                      cursor: available ? "pointer" : "not-allowed",
                    }}
                    onClick={() => handleDownload(row, kind)}
                    disabled={!available || busy}
                    title={
                      available
                        ? `הורדת ${label}`
                        : kind === "signed"
                          ? "ההצעה טרם נחתמה"
                          : "הקובץ לא נשמר עבור הצעה זו"
                    }
                  >
                    {busy ? "⏳" : label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {rows && rows.length > 0 && (
          <p style={hint}>
            מוצגות הצעות שנשלחו ללקוח במייל בלבד. הצעות שנשלחו לפני הוספת הארכיון
            עשויות להופיע ללא קובץ DOC.
          </p>
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
  maxWidth: "640px",
  maxHeight: "88vh",
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

const rowBox = {
  padding: "12px 14px",
  marginBottom: "10px",
  borderRadius: "10px",
  background: "rgba(51,65,85,0.25)",
  border: "1px solid rgba(51,65,85,0.6)",
};

const rowTop = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: "10px",
  marginBottom: "4px",
};

const rowSubject = {
  fontSize: "14px",
  fontWeight: 700,
  color: "#e2e8f0",
};

const rowId = {
  fontSize: "12px",
  fontWeight: 700,
  color: "#a5b4fc",
  direction: "ltr",
};

const rowMeta = {
  display: "flex",
  alignItems: "center",
  gap: "6px",
  flexWrap: "wrap",
  fontSize: "12px",
  color: "#94a3b8",
  marginBottom: "10px",
};

const dot = { color: "#475569" };

const signedTag = {
  marginRight: "4px",
  padding: "2px 8px",
  borderRadius: "999px",
  background: "rgba(34,197,94,0.12)",
  border: "1px solid rgba(34,197,94,0.35)",
  color: "#86efac",
  fontSize: "11px",
  fontWeight: 600,
};

const errorBox = {
  marginBottom: "14px",
  padding: "10px 14px",
  borderRadius: "8px",
  background: "rgba(239,68,68,0.12)",
  border: "1px solid rgba(239,68,68,0.4)",
  color: "#fca5a5",
  fontSize: "13px",
};

const emptyBox = {
  padding: "24px",
  textAlign: "center",
  color: "#94a3b8",
  fontSize: "13px",
};

const hint = {
  fontSize: "12px",
  lineHeight: 1.7,
  color: "#64748b",
  margin: "14px 0 0",
};
