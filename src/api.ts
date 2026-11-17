export class Unauthorized extends Error {}

/** Everything an operator needs to report or grep for a failing call. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly param: string | undefined;
  readonly requestId: string | null;
  readonly url: string;

  constructor(message: string, init: {
    status: number; code?: string; param?: string; requestId?: string | null; url: string;
  }) {
    super(message);
    this.name = "ApiError";
    this.status = init.status;
    this.code = init.code;
    this.param = init.param;
    this.requestId = init.requestId ?? null;
    this.url = init.url;
  }

  toText(): string {
    return [
      `POST/GET ${this.url}`,
      `status: ${this.status}`,
      this.code ? `code: ${this.code}` : null,
      this.param ? `param: ${this.param}` : null,
      this.requestId ? `request id: ${this.requestId}` : null,
      `message: ${this.message}`,
    ]
      .filter(Boolean)
      .join("\n");
  }
}

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
  const url = `${BASE}${path}`;
  let response: Response;
  try {
    response = await fetch(url, { headers: token ? { "X-Admin-Token": token } : {} });
  } catch (e) {
    throw new ApiError(networkHint(e, url), { status: 0, url });
  }
  if (response.status === 401 || response.status === 403) {
    clearToken();
    throw new Unauthorized((await failure(response, url)).message);
  }
  if (!response.ok) {
    throw await failure(response, url);
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("json")) {
    // Almost always the admin console calling itself instead of the gateway: the static
    // server answers with index.html and JSON.parse would say "Unexpected token '<'".
    throw new ApiError(
      `${BASE || "this origin"}${path} answered with ${contentType || "no content type"}, not JSON. ` +
        "The console is probably pointed at the wrong gateway: check GATEWAY_URL (config.js).",
      { status: response.status, url },
    );
  }
  return (await response.json()) as T;
}

async function failure(response: Response, url: string): Promise<Error> {
  const requestId = response.headers.get("X-Request-Id");
  try {
    const body = await response.json();
    const error = body?.error ?? {};
    return new ApiError(error.message ?? `HTTP ${response.status}`, {
      status: response.status,
      code: error.code,
      param: error.param,
      requestId,
      url,
    });
  } catch {
    return new ApiError(`HTTP ${response.status} with no JSON body`, {
      status: response.status,
      requestId,
      url,
    });
  }
}

/** Write calls share the same auth, error envelope and 401 handling as reads. */
export async function send<T>(
  method: "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const token = getToken();
  const url = `${BASE}${path}`;
  const headers: Record<string, string> = {
    ...(token ? { "X-Admin-Token": token } : {}),
    ...(body === undefined ? {} : { "Content-Type": "application/json" }),
  };

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    throw new ApiError(networkHint(e, url), { status: 0, url });
  }

  if (response.status === 401 || response.status === 403) {
    clearToken();
    throw new Unauthorized((await failure(response, url)).message);
  }
  if (!response.ok) {
    throw await failure(response, url);
  }
  const text = await response.text();
  return (text ? JSON.parse(text) : {}) as T;
}

/** A thrown fetch is usually not a code bug; say which one it is. */
function networkHint(e: unknown, url: string): string {
  const detail = e instanceof Error ? e.message : String(e);
  return (
    `Could not reach ${url} (${detail}). Usually: the gateway is down, the URL in ` +
    "config.js is wrong, or the gateway's GATEWAY_CORS_ORIGINS does not include this origin."
  );
}

/** True when the gateway is behind an authenticating proxy, i.e. no token is needed. */
export async function detectAuthMode(): Promise<"proxy" | "token"> {
  try {
    const response = await fetch(`${BASE}/admin/settings`);
    if (!response.ok) return "token";
    const body = await response.json();
    return body?.auth_mode === "proxy" ? "proxy" : "token";
  } catch {
    return "token";
  }
}

export const gatewayOrigin = BASE || window.location.origin;
