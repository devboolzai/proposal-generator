// ============================================================
// APP STYLES — inline style objects for the whole app
// Function-valued keys take state and return a style object:
//   stepItem(active, completed) | serviceChip(selected)
//   checkbox(checked)           | btn(variant)
// ============================================================

// Brand palette, sampled straight out of public/cover-image.jpg so the
// generated pages match the printed cover rather than approximating it.
export const BRAND = {
  purple: "#460093",
  purpleSoft: "#8360B8", // footer / secondary marks
  cream: "#FDF8F1",
  paper: "#FFFFFF",
  ink: "#1A1A1A",
  rule: "#3B3B3B",
};

// Bullet glyphs used in the reference proposals: a check for what the
// service includes, a diamond for money lines, a hollow circle for notes.
export const GLYPH = {
  check: "✔",
  diamond: "❖",
  circle: "○",
};

export const styles = {
  app: {
    fontFamily: "var(--font-stack)",
    direction: "rtl",
    minHeight: "100vh",
    background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)",
    color: "#e2e8f0",
  },
  header: {
    background: "linear-gradient(90deg, #3b82f6, #6366f1, #8b5cf6)",
    padding: "20px 32px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    boxShadow: "0 4px 30px rgba(99,102,241,0.3)",
  },
  headerTitle: {
    fontSize: "24px",
    fontWeight: "800",
    color: "#fff",
    margin: 0,
    letterSpacing: "-0.5px",
  },
  headerSub: {
    fontSize: "13px",
    color: "rgba(255,255,255,0.8)",
    margin: 0,
  },
  stepBar: {
    display: "flex",
    gap: "4px",
    padding: "16px 32px",
    background: "rgba(15,23,42,0.8)",
    borderBottom: "1px solid rgba(99,102,241,0.2)",
  },
  stepItem: (active, completed) => ({
    flex: 1,
    padding: "10px 16px",
    borderRadius: "8px",
    textAlign: "center",
    fontSize: "13px",
    fontWeight: active ? "700" : "500",
    cursor: "pointer",
    background: active
      ? "linear-gradient(135deg, #6366f1, #8b5cf6)"
      : completed
        ? "rgba(99,102,241,0.15)"
        : "rgba(30,41,59,0.5)",
    color: active ? "#fff" : completed ? "#a5b4fc" : "#64748b",
    border: active
      ? "1px solid #818cf8"
      : completed
        ? "1px solid rgba(99,102,241,0.3)"
        : "1px solid rgba(51,65,85,0.5)",
    transition: "all 0.2s",
  }),
  content: {
    maxWidth: "900px",
    margin: "0 auto",
    padding: "24px 32px",
  },
  card: {
    background: "rgba(30,41,59,0.6)",
    border: "1px solid rgba(99,102,241,0.15)",
    borderRadius: "16px",
    padding: "24px",
    marginBottom: "20px",
    backdropFilter: "blur(10px)",
  },
  cardTitle: {
    fontSize: "17px",
    fontWeight: "700",
    color: "#a5b4fc",
    marginBottom: "16px",
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  label: {
    display: "block",
    fontSize: "13px",
    fontWeight: "600",
    color: "#94a3b8",
    marginBottom: "6px",
  },
  input: {
    width: "100%",
    padding: "10px 14px",
    borderRadius: "8px",
    border: "1px solid rgba(99,102,241,0.25)",
    background: "rgba(15,23,42,0.6)",
    color: "#e2e8f0",
    fontSize: "14px",
    outline: "none",
    direction: "rtl",
    boxSizing: "border-box",
    transition: "border-color 0.2s",
  },
  textarea: {
    width: "100%",
    padding: "10px 14px",
    borderRadius: "8px",
    border: "1px solid rgba(99,102,241,0.25)",
    background: "rgba(15,23,42,0.6)",
    color: "#e2e8f0",
    fontSize: "14px",
    outline: "none",
    direction: "rtl",
    boxSizing: "border-box",
    minHeight: "80px",
    resize: "vertical",
    fontFamily: "var(--font-stack)",
  },
  select: {
    width: "100%",
    padding: "10px 14px",
    borderRadius: "8px",
    border: "1px solid rgba(99,102,241,0.25)",
    background: "rgba(15,23,42,0.6)",
    color: "#e2e8f0",
    fontSize: "14px",
    outline: "none",
    direction: "rtl",
    boxSizing: "border-box",
  },
  row: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "16px",
    marginBottom: "16px",
  },
  row3: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: "16px",
    marginBottom: "16px",
  },
  fieldGroup: { marginBottom: "16px" },
  serviceChip: (selected) => ({
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "8px 16px",
    borderRadius: "20px",
    fontSize: "13px",
    fontWeight: "600",
    cursor: "pointer",
    border: selected
      ? "2px solid #818cf8"
      : "2px solid rgba(51,65,85,0.5)",
    background: selected
      ? "rgba(99,102,241,0.2)"
      : "rgba(30,41,59,0.3)",
    color: selected ? "#c7d2fe" : "#64748b",
    transition: "all 0.2s",
    margin: "4px",
  }),
  checkbox: (checked) => ({
    width: "18px",
    height: "18px",
    borderRadius: "4px",
    border: checked
      ? "2px solid #818cf8"
      : "2px solid rgba(100,116,139,0.4)",
    background: checked ? "#6366f1" : "transparent",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    flexShrink: 0,
    fontSize: "11px",
    color: "#fff",
    transition: "all 0.15s",
  }),
  noteRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: "10px",
    padding: "8px 0",
    borderBottom: "1px solid rgba(51,65,85,0.3)",
    fontSize: "13px",
    lineHeight: "1.6",
  },
  btn: (variant) => ({
    padding: variant === "lg" ? "14px 32px" : "10px 20px",
    borderRadius: "10px",
    border: "none",
    fontSize: variant === "lg" ? "16px" : "14px",
    fontWeight: "700",
    cursor: "pointer",
    background:
      variant === "primary" || variant === "lg"
        ? "linear-gradient(135deg, #6366f1, #8b5cf6)"
        : variant === "danger"
          ? "rgba(239,68,68,0.15)"
          : "rgba(51,65,85,0.5)",
    color:
      variant === "primary" || variant === "lg"
        ? "#fff"
        : variant === "danger"
          ? "#f87171"
          : "#94a3b8",
    border:
      variant === "danger"
        ? "1px solid rgba(239,68,68,0.3)"
        : variant === "primary" || variant === "lg"
          ? "1px solid #818cf8"
          : "1px solid rgba(51,65,85,0.5)",
    transition: "all 0.2s",
  }),
  btnRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    marginTop: "24px",
  },
  pricingHeader: {
    display: "grid",
    gridTemplateColumns: "2fr 1fr 1fr 1fr 40px",
    gap: "8px",
    padding: "8px 0",
    borderBottom: "2px solid rgba(99,102,241,0.3)",
    fontSize: "12px",
    fontWeight: "700",
    color: "#94a3b8",
  },
  pricingRow: {
    display: "grid",
    gridTemplateColumns: "2fr 1fr 1fr 1fr 40px",
    gap: "8px",
    padding: "8px 0",
    alignItems: "center",
    borderBottom: "1px solid rgba(51,65,85,0.3)",
  },
  pricingInput: {
    padding: "8px 10px",
    borderRadius: "6px",
    border: "1px solid rgba(99,102,241,0.2)",
    background: "rgba(15,23,42,0.6)",
    color: "#e2e8f0",
    fontSize: "13px",
    outline: "none",
    direction: "rtl",
    width: "100%",
    boxSizing: "border-box",
  },
  // Preview styles
  preview: {
    background: BRAND.paper,
    color: BRAND.ink,
    direction: "rtl",
    fontFamily: "var(--font-stack)",
    padding: "48px",
    maxWidth: "800px",
    margin: "0 auto",
    borderRadius: "12px",
    boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
    lineHeight: "1.7",
    fontSize: "14px",
  },
  previewHeader: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: "28px",
  },
  previewProposalId: {
    fontSize: "14px",
    fontWeight: "700",
    color: BRAND.purple,
    marginBottom: "6px",
  },
  previewDate: {
    fontSize: "13px",
    color: BRAND.ink,
    textDecoration: "underline",
  },
  previewTitle: {
    fontSize: "17px",
    color: BRAND.ink,
    textDecoration: "underline",
    textAlign: "center",
    marginBottom: "28px",
  },
  previewSection: {
    marginBottom: "22px",
  },
  previewSectionTitle: {
    fontSize: "15px",
    fontWeight: "700",
    color: BRAND.purple,
    marginBottom: "8px",
  },
  previewLead: {
    fontSize: "13px",
    fontWeight: "700",
    color: BRAND.ink,
    marginBottom: "8px",
  },
  previewTable: {
    width: "100%",
    borderCollapse: "collapse",
    marginBottom: "22px",
  },
  previewTh: {
    background: BRAND.cream,
    padding: "9px 13px",
    border: `1px solid ${BRAND.purple}`,
    textAlign: "right",
    fontSize: "13px",
    fontWeight: "700",
    color: BRAND.purple,
  },
  previewTd: {
    padding: "9px 13px",
    border: `1px solid ${BRAND.rule}`,
    textAlign: "right",
    fontSize: "13px",
  },
  previewNotesTitle: {
    fontSize: "15px",
    fontWeight: "700",
    color: BRAND.purple,
    marginBottom: "10px",
  },
  previewNote: {
    fontSize: "11.5px",
    color: BRAND.ink,
    marginBottom: "3px",
    paddingRight: "16px",
    position: "relative",
  },
  previewAppendixTitle: {
    fontSize: "15px",
    fontWeight: "700",
    color: BRAND.purple,
    textAlign: "center",
    margin: "26px 0 18px",
  },
};
