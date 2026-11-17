import { useState } from "react";
import { api, getToken } from "../api";
import { useAuth } from "../auth";

/** The token is verified against a cheap admin call before it is kept, so a typo fails
 *  here rather than as a wall of 401s on every screen. */
export function Login() {
  const { signIn } = useAuth();
  const [token, setValue] = useState(getToken() ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    signIn(token);
    try {
      await api("/admin/settings");
      window.location.assign("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not verify the token.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <form onSubmit={submit} className="card">
        <h1>
          <span className="dot" /> Path admin
        </h1>
        <p className="muted">
          Paste the admin token. It is kept in this tab's session storage and cleared when
          the tab closes.
        </p>
        <label htmlFor="token">Admin token</label>
        <input
          id="token"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={token}
          onChange={(e) => setValue(e.target.value)}
          placeholder="X-Admin-Token"
        />
        {error ? <p className="error">{error}</p> : null}
        <button type="submit" disabled={busy || token.trim().length === 0}>
          {busy ? "Checking…" : "Open dashboard"}
        </button>
      </form>
    </div>
  );
}
