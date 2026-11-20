import { useState } from "react";
import { api, gatewayOrigin, setToken } from "../api";
import { useAsync } from "../useAsync";
import { useAuth } from "../auth";
import { Badge, Loading, Panel } from "../components/ui";
import { ErrorNote } from "../components/ErrorNote";
import type { GatewaySettings } from "../types";

/** Who you are and which token this console is using. Gateway switches live on Configuration. */
export function SettingsPage() {
  const { mode, signIn, signOut } = useAuth();
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

  return (
    <>
      <h1>Settings</h1>
      {note ? <p className="note">{note}</p> : null}

      <Panel title="Session" hint={mode === "proxy" ? "SSO proxy" : "admin token"}>
        {settings.loading ? (
          <Loading />
        ) : settings.error ? (
          <ErrorNote error={settings.error} />
        ) : (
          <div className="settings-body">
            <dl className="facts">
              <div>
                <dt>Signed in as</dt>
                <dd>{gw?.subject ?? "bootstrap token"}</dd>
              </div>
              <div>
                <dt>Scopes</dt>
                <dd>
                  {(gw?.scopes ?? []).length > 0 ? (
                    (gw?.scopes ?? []).map((scope) => (
                      <Badge key={scope} tone={scope === "write" ? "good" : "neutral"}>
                        {scope}
                      </Badge>
                    ))
                  ) : (
                    <span className="muted">—</span>
                  )}
                </dd>
              </div>
              <div>
                <dt>Gateway</dt>
                <dd>
                  <code>{gatewayOrigin || "this origin"}</code>
                </dd>
              </div>
              <div>
                <dt>Build</dt>
                <dd>
                  <code>{__BUILD_ID__}</code>
                </dd>
              </div>
            </dl>

            {readOnly ? (
              <p className="note">
                This token is read-only. Create, edit and delete controls are disabled;
                use a token with the <code>write</code> scope to change configuration.
              </p>
            ) : null}

            {mode === "token" ? (
              <>
                <h3 className="form-section">Replace token</h3>
                <label className="field">
                  <span>Admin token</span>
                  <input
                    type="password"
                    value={token}
                    placeholder="paste a token to switch this tab to it"
                    onChange={(e) => setTokenValue(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <small>Kept in sessionStorage only; never a cookie and never a URL.</small>
                </label>
                <div className="modal-actions">
                  <button className="ghost" onClick={signOut}>
                    Sign out
                  </button>
                  <button className="primary" disabled={!token.trim()} onClick={applyToken}>
                    Use token
                  </button>
                </div>
              </>
            ) : (
              <p className="muted">
                Authentication is delegated to the proxy; there is no token to manage here.
              </p>
            )}
          </div>
        )}
      </Panel>
    </>
  );
}
