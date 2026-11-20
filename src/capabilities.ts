import { api } from "./api";
import type { GatewaySettings } from "./types";

/**
 * The gateway reports the calling token's scopes on /admin/settings. One request per
 * page load is enough; the result is cached for the session so every page agrees and a
 * read-only token never shows an action that would 403.
 */
let cached: Promise<GatewaySettings> | null = null;

export function capabilities(): Promise<GatewaySettings> {
  if (!cached) {
    cached = api<GatewaySettings>("/admin/settings").catch((error) => {
      cached = null;
      throw error;
    });
  }
  return cached;
}

/** Called when the token changes, so the next page re-reads the scopes. */
export function resetCapabilities(): void {
  cached = null;
}
