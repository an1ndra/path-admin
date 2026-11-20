import { useState } from "react";
import { api, gatewayOrigin, setToken } from "../api";
import { useAsync } from "../useAsync";
import { useAuth } from "../auth";
import { useTheme, type ThemeMode } from "../theme";
import { Badge, Loading, Panel } from "../components/ui";
import { ErrorNote } from "../components/ErrorNote";
import type { GatewaySettings } from "../types";

const SCOPE_COPY: Record<string, string> = {
  read: "View configuration, usage and client keys.",
  write: "Create, edit and delete configuration.",
  admin: "Full administrative access to this gateway.",
  keys: "Create and revoke client keys.",
  routes: "Create, edit and delete routes.",
  providers: "Create, edit and delete providers.",
};

function describeScope(scope: string): string {
  return SCOPE_COPY[scope] ?? "Granted to this identity by the gateway.";
}

/** Who you are and which token this console is using. Gateway switches live on Configuration. */
export function SettingsPage() {
  const { mode, signIn, signOut } = useAuth();
  const { mode: themeMode, colorBlind, resolved, setMode: setThemeMode, setColorBlind } = useTheme();
  const settings = useAsync(() => api<GatewaySettings>("/admin/settings"), []);
  const [token, setTokenValue] = useState("");
  const [note, setNote] = useState<string | null>(null);

  function applyToken() {
    const trimmed = token.trim();
    if (!trimmed) return;
    setToken(trimmed);
    signIn(trimmed);
    setTokenValue("");
    setNote("Token replaced for this tab.");
    settings.reload();
  }

  const gw = settings.data;
  const readOnly = gw?.can_write === false;
  const scopes = gw?.scopes ?? [];

  return (
    <>
      <header className="page-head page-head-titled page-head-settings">
        <div className="page-head-titles">
          <h1>Settings</h1>
          <p className="page-sub">
            The identity this console is signed in as, what it is allowed to do, and which
            gateway and build it is talking to.
          </p>
        </div>
      </header>

      <Panel title="Session" hint={mode === "proxy" ? "SSO proxy" : "admin token"}>
        {settings.loading ? (
          <Loading label="Loading session…" />
        ) : settings.error ? (
          <ErrorNote error={settings.error} />
        ) : (
          <div className="settings-body page-session">
            <div className="page-identity">
              <div className="page-identity-id">
                <span className="page-eyebrow">Signed in as</span>
                <span className="page-identity-value">{gw?.subject ?? "bootstrap token"}</span>
              </div>
              <div className="page-identity-badges">
                <Badge tone={mode === "proxy" ? "info" : "neutral"}>
                  {mode === "proxy" ? "SSO proxy" : "Admin token"}
                </Badge>
                <Badge tone={readOnly ? "neutral" : "info"} dot>
                  {readOnly ? "read-only" : "read and write"}
                </Badge>
              </div>
            </div>

            <dl className="facts page-facts">
              <div>
                <dt>Gateway</dt>
                <dd>
                  <code>{gatewayOrigin || "same origin"}</code>
                </dd>
              </div>
              <div>
                <dt>Auth mode</dt>
                <dd>{gw?.auth_mode ?? mode ?? "—"}</dd>
              </div>
              <div>
                <dt>Build</dt>
                <dd>
                  <code>{__BUILD_ID__}</code>
                </dd>
              </div>
            </dl>

            <section className="page-scopes" aria-labelledby="settings-scopes-title">
              <h3 className="page-section-title" id="settings-scopes-title">
                Scopes
              </h3>
              {scopes.length > 0 ? (
                <ul className="page-scope-list">
                  {scopes.map((scope) => (
                    <li key={scope}>
                      <Badge tone={scope === "write" ? "info" : "neutral"}>{scope}</Badge>
                      <span>{describeScope(scope)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="page-muted-line">
                  No scopes reported. This identity may be a bootstrap token or a proxy session.
                </p>
              )}
            </section>

            {readOnly ? (
              <p className="page-callout page-callout-warn" role="note">
                This token is read-only. Create, edit and delete controls are disabled. Use a
                token with the <code>write</code> scope to change configuration.
              </p>
            ) : null}

            {mode === "token" ? (
              <section className="page-token" aria-labelledby="settings-token-title">
                <div className="page-token-head">
                  <h3 id="settings-token-title">Replace token</h3>
                  <span className="page-token-hint">Applies to this tab only</span>
                </div>
                <label className="field page-token-field" htmlFor="settings-admin-token">
                  <span>Admin token</span>
                  <input
                    id="settings-admin-token"
                    type="password"
                    value={token}
                    placeholder="paste a token to switch this tab to it"
                    onChange={(e) => setTokenValue(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    aria-describedby="settings-token-help"
                  />
                  <small id="settings-token-help">
                    Stored in sessionStorage only; never a cookie and never a URL. Signing out clears it.
                  </small>
                </label>
                <div className="page-token-actions">
                  <button type="button" className="ghost" onClick={signOut}>
                    Sign out
                  </button>
                  <button
                    type="button"
                    className="primary"
                    disabled={!token.trim()}
                    onClick={applyToken}
                  >
                    Use token
                  </button>
                </div>
                {note ? (
                  <p className="page-feedback" role="status">
                    {note}
                  </p>
                ) : null}
              </section>
            ) : (
              <p className="page-muted-line">
                Authentication is delegated to the proxy; there is no token to manage here.
              </p>
            )}
          </div>
        )}
      </Panel>

      <Panel title="Appearance" hint="stored in this browser">
        <div className="settings-body">
          <div className="page-appearance-row">
            <span className="page-appearance-label" id="theme-label">
              Theme
            </span>
            <div className="segmented" role="group" aria-labelledby="theme-label">
              {(["system", "light", "dark"] as ThemeMode[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  className={themeMode === value ? "on" : ""}
                  aria-pressed={themeMode === value}
                  onClick={() => setThemeMode(value)}
                >
                  {value === "system" ? `System · ${resolved}` : value[0].toUpperCase() + value.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <label className="appearance-check">
            <input
              type="checkbox"
              checked={colorBlind}
              onChange={(e) => setColorBlind(e.target.checked)}
            />
            <span>
              <strong>Colour-blind friendly palette</strong>
              <small>
                Status uses blue, orange and vermillion instead of red and green. Every state is
                still written out, so colour is never the only signal.
              </small>
            </span>
          </label>
        </div>
      </Panel>
    </>
  );
}
