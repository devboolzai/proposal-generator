// Brand palette, copied from the generator's src/styles/appStyles.js.
//
// A deliberate duplication: that file is 359 lines of proposal-editor
// styling this page has no use for, and importing it would drag the
// generator's look — and its bundle — into the client-facing app. What
// the signing page needs is six hex values.

export const BRAND = {
  purple: "#460093",
  purpleSoft: "#8360B8",
  cream: "#FDF8F1",
  paper: "#FFFFFF",
  ink: "#1A1A1A",
  rule: "#3B3B3B",
};

export const styles = {
  page: {
    direction: "rtl",
    minHeight: "100dvh",
    background: BRAND.cream,
    color: BRAND.ink,
    fontFamily: "var(--font-stack)",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    background: BRAND.purple,
    color: "#fff",
    padding: "16px 20px",
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: "12px",
    flexWrap: "wrap",
  },
  headerTitle: {
    fontSize: "18px",
    fontWeight: 800,
    margin: 0,
  },
  headerSub: {
    fontSize: "13px",
    opacity: 0.85,
  },
  main: {
    flex: 1,
    width: "100%",
    maxWidth: "760px",
    margin: "0 auto",
    padding: "20px 16px 48px",
  },
  card: {
    background: BRAND.paper,
    border: "1px solid rgba(70,0,147,0.14)",
    borderRadius: "14px",
    padding: "20px",
    marginBottom: "18px",
    boxShadow: "0 2px 10px rgba(70,0,147,0.05)",
  },
  cardTitle: {
    fontSize: "16px",
    fontWeight: 700,
    color: BRAND.purple,
    marginBottom: "14px",
  },
  label: {
    display: "block",
    fontSize: "13px",
    fontWeight: 600,
    color: "#555",
    marginBottom: "6px",
  },
  input: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: "9px",
    border: "1px solid rgba(70,0,147,0.25)",
    background: "#fff",
    color: BRAND.ink,
    // 16px keeps iOS Safari from zooming the page when the field is focused.
    fontSize: "16px",
    fontFamily: "var(--font-stack)",
    direction: "rtl",
    outline: "none",
    boxSizing: "border-box",
  },
  btn: (variant) => ({
    padding: variant === "lg" ? "15px 30px" : "11px 20px",
    borderRadius: "10px",
    border: variant === "ghost" ? `1px solid ${BRAND.purple}` : "none",
    fontSize: variant === "lg" ? "17px" : "15px",
    fontWeight: 700,
    fontFamily: "var(--font-stack)",
    cursor: "pointer",
    background: variant === "ghost" ? "transparent" : BRAND.purple,
    color: variant === "ghost" ? BRAND.purple : "#fff",
    // Comfortably above the 44px minimum tap target on a phone.
    minHeight: "48px",
  }),
  note: {
    fontSize: "13px",
    lineHeight: 1.7,
    color: "#5c5c5c",
  },
  footer: {
    textAlign: "center",
    padding: "18px",
    fontSize: "12px",
    color: BRAND.purpleSoft,
  },
};
