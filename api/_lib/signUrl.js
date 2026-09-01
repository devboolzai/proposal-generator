// The signing app is a separate Vercel project on its own domain, so the
// generator cannot derive the link from its own request — it has to be told.
// Keeping the construction in one place means the link in the email and the
// link in the copy button can never disagree.

export function signUrlFor(token) {
  const base = process.env.SIGN_BASE_URL;
  if (!base) throw new Error("SIGN_BASE_URL is not configured");
  return `${base.replace(/\/+$/, "")}/s/${token}`;
}
