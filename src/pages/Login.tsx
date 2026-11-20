import { useState } from "react";
import { api, clearToken, gatewayOrigin, getToken, setToken } from "../api";
import { useAuth } from "../auth";

/**
 * The token is verified against a cheap admin call before the session accepts it, so a typo
 * fails here rather than as a wall of 401s on every screen. A failed attempt also clears the
 * stored token, otherwise the console would render as if signed in.
 */
export function Login() {
  const { signIn } = useAuth();
  const [token, setValue] = useState(getToken() ?? "");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const value = token.trim();
    if (!value || busy) return;
    setBusy(true);
    setError(null);
    setToken(value);
    try {
      await api("/admin/settings");
      signIn(value);
      window.location.assign("/");
    } catch (e) {
      clearToken();
      setError(
        e instanceof Error && e.message
          ? e.message
          : "Could not verify the token against this gateway.",
      );
      setBusy(false);
    }
  }

  let origin = gatewayOrigin;
  try {
    origin = new URL(gatewayOrigin).host;
  } catch {
    // keep the raw value
  }

  return (
    <div className="login">
      <div className="login-panel">
        <div className="login-brand">
          <span className="dot" /> Path
          <span className="login-tag">admin</span>
        </div>

        <h1>Sign in to the gateway console</h1>
        <p className="login-lede">
          Read and write configuration for <code>{origin}</code>. The token stays in this tab's
          session storage — no cookie, no account.
        </p>

        <form onSubmit={submit} className="login-form">
          <label htmlFor="token">Admin token</label>
          <div className="login-field">
            <input
              id="token"
              type={show ? "text" : "password"}
              autoComplete="off"
              spellCheck={false}
              value={token}
              onChange={(e) => setValue(e.target.value)}
              placeholder="paste the token"
              aria-describedby="token-hint"
              aria-invalid={error ? true : undefined}
              autoFocus
            />
            <button
              type="button"
              className="login-reveal"
              onClick={() => setShow((value) => !value)}
              aria-label={show ? "Hide token" : "Show token"}
            >
              {show ? "Hide" : "Show"}
            </button>
          </div>
          <p className="login-hint" id="token-hint">
            Set by <code>GATEWAY_ADMIN_TOKEN</code> on the gateway. Per-person tokens come from{" "}
            <code>POST /admin/tokens</code>, with <code>read</code> or <code>read,write</code>.
          </p>

          {error ? (
            <p className="login-error" role="alert">
              {error}
            </p>
          ) : null}

          <button type="submit" className="login-submit" disabled={busy || !token.trim()}>
            {busy ? "Checking token…" : "Open dashboard"}
          </button>
        </form>

        <p className="login-foot">
          Behind an authenticating proxy the console skips this screen. Forgot the token? Read it
          from the gateway's environment, or mint one with the bootstrap token.
        </p>
      </div>
    </div>
  );
}
