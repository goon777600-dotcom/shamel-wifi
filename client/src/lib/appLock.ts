export const APP_LOCK_TOKEN_STORAGE_KEY = "shamel-app-lock-token";

function getAppLockToken() {
  try {
    return sessionStorage.getItem(APP_LOCK_TOKEN_STORAGE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function requestHeaders(headers?: HeadersInit) {
  const nextHeaders = new Headers(headers);
  const token = getAppLockToken();
  if (token) nextHeaders.set("X-App-Lock-Token", token);
  return nextHeaders;
}

export function rememberAppLockToken(token: string | undefined) {
  if (!token) return;
  try {
    sessionStorage.setItem(APP_LOCK_TOKEN_STORAGE_KEY, token);
  } catch {
    // Cookie-only browsers remain supported.
  }
}

export function clearAppLockToken() {
  try {
    sessionStorage.removeItem(APP_LOCK_TOKEN_STORAGE_KEY);
  } catch {
    // Storage can be disabled in strict privacy modes.
  }
}

export async function requestAppLock(path: string, options?: RequestInit) {
  const response = await fetch(path, { credentials: "include", ...(options ?? {}), headers: requestHeaders(options?.headers) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || "تعذر التحقق من القفل");
  return payload as { unlocked?: boolean; ok?: boolean; token?: string };
}

export function lockApplication() {
  return requestAppLock("/api/app-lock/lock", { method: "POST" }).then(() => {
    clearAppLockToken();
    window.dispatchEvent(new Event("shamel-app-locked"));
  });
}
