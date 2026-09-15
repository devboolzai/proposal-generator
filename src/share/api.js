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

export async function getJson(path, accessCode) {
  let response;
  try {
    response = await fetch(path, { headers: { "x-app-code": accessCode } });
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

/**
 * Downloads a private blob and saves it.
 *
 * The route is guarded by a header, which a plain <a download> cannot send —
 * hence fetching the bytes and handing the browser an object URL. The
 * alternative, putting the code in the query string, would leak it into
 * history and server logs.
 */
export async function downloadFile(path, accessCode) {
  let response;
  try {
    response = await fetch(path, { headers: { "x-app-code": accessCode } });
  } catch {
    throw new ApiError("אין חיבור לשרת. יש לבדוק את החיבור לאינטרנט.", 0);
  }

  if (!response.ok) {
    if (response.status === 401) clearAccessCode();
    // The error body is JSON even though a success would be a file.
    const payload = await response.json().catch(() => ({}));
    throw new ApiError(payload.error || `ההורדה נכשלה (${response.status})`, response.status);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileNameFrom(response.headers.get("content-disposition"));
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking immediately can cancel the download in some browsers; a tick is
  // enough for the click to have been taken.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The Hebrew file name the server chose, out of its RFC 5987 header. */
function fileNameFrom(disposition) {
  const match = /filename\*=UTF-8''([^;]+)/i.exec(disposition ?? "");
  if (!match) return "proposal";
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return "proposal";
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
