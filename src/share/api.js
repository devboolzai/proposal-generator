// ============================================================
// Talking to the salesperson-side functions.
//
// Every write endpoint is guarded by an access code, since the
// generator is a public URL. The code is entered once and kept
// in localStorage; a 401 clears it so the modal can ask again
// rather than failing silently forever.
// ============================================================

const ACCESS_CODE_KEY = "boolzai.accessCode";

export function getAccessCode() {
  try {
    return localStorage.getItem(ACCESS_CODE_KEY) || "";
  } catch {
    return "";
  }
}

export function setAccessCode(code) {
  try {
    localStorage.setItem(ACCESS_CODE_KEY, code);
  } catch {
    /* private browsing — the code just won't be remembered */
  }
}

export function clearAccessCode() {
  try {
    localStorage.removeItem(ACCESS_CODE_KEY);
  } catch {
    /* nothing to clean up */
  }
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function postJson(path, body, accessCode) {
  let response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-app-code": accessCode,
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError("אין חיבור לשרת. יש לבדוק את החיבור לאינטרנט.", 0);
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401) clearAccessCode();
    throw new ApiError(payload.error || `הבקשה נכשלה (${response.status})`, response.status);
  }
  return payload;
}
