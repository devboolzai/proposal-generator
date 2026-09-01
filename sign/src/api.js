// Same-origin calls to this project's own functions, so no CORS and no
// credentials — the token in the URL is the whole authorisation story.

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** The PDF is served through a function so expiry is actually enforced. */
export function pdfUrl(token) {
  return `/api/proposal-pdf?token=${encodeURIComponent(token)}`;
}

export async function fetchProposal(token) {
  const response = await request(`/api/proposal-get?token=${encodeURIComponent(token)}`);
  return response;
}

export async function submitSignature({ token, signerName, consent, signatureBlockPng }) {
  return request("/api/proposal-sign", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token, signerName, consent, signatureBlockPng }),
  });
}

async function request(path, init) {
  let response;
  try {
    response = await fetch(path, init);
  } catch {
    throw new ApiError("אין חיבור לאינטרנט. יש לנסות שוב.", 0);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(payload.error || "אירעה שגיאה", response.status);
  }
  return payload;
}
