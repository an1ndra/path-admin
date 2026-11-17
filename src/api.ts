export class Unauthorized extends Error {}

const BASE: string = import.meta.env.VITE_GATEWAY_URL ?? "";
const TOKEN_KEY = "path.admin.token";

/** The token lives in sessionStorage only: never a cookie, never a URL, gone on tab close. */
export function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
}

export async function api<T>(path: string): Promise<T> {
  const token = getToken();
  const response = await fetch(`${BASE}${path}`, {
    headers: token ? { "X-Admin-Token": token } : {},
  });
  if (response.status === 401 || response.status === 403) {
    clearToken();
    throw new Unauthorized(await messageOf(response));
  }
  if (!response.ok) {
    throw new Error(await messageOf(response));
  }
  return (await response.json()) as T;
}

async function messageOf(response: Response): Promise<string> {
  try {
    const body = await response.json();
    return body?.error?.message ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

export const gatewayOrigin = BASE || window.location.origin;
