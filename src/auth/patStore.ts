/**
 * Browser-local persistence for the user's Up Personal Access Token (PAT).
 *
 * Security note: the PAT lives in `localStorage` for this private/learning
 * app. It is sandboxed to the Canva app iframe origin, but if you adapt this
 * for a public app you should move the token off the client (small backend +
 * Canva user-state).
 */
const KEY = "up.pat";

export function getPat(): string | undefined {
  try {
    const v = window.localStorage.getItem(KEY);
    return v && v.length > 0 ? v : undefined;
  } catch {
    return undefined;
  }
}

export function setPat(token: string): void {
  try {
    window.localStorage.setItem(KEY, token.trim());
  } catch {
    // localStorage may be unavailable (private browsing, etc.). Swallow -
    // the UI will surface the failure when the next API call returns 401.
  }
}

export function clearPat(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
