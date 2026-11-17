export class Unauthorized extends Error {}

declare global {
  interface Window {
    __PATH_CONFIG__?: { gatewayUrl?: string };
  }
}

/**
 * Runtime config wins over the build-time value, so one container image works in any
 * environment: Dokploy/Compose sets GATEWAY_URL and the entrypoint rewrites config.js.
 * Empty means same origin.
 */
const BASE: string =
  (typeof window !== "undefined" ? window.__PATH_CONFIG__?.gatewayUrl : "") ||
  import.meta.env.VITE_GATEWAY_URL ||
  "";
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

/** Write calls share the same auth and 401 handling as reads. */
export async function send<T>(
  method: "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const token = getToken();
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(token ? { "X-Admin-Token": token } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 401 || response.status === 403) {
    clearToken();
    throw new Unauthorized(await messageOf(response));
  }
  if (!response.ok) {
    throw new Error(await messageOf(response));
  }
  const text = await response.text();
  return (text ? JSON.parse(text) : {}) as T;
}

export const gatewayOrigin = BASE || window.location.origin;
