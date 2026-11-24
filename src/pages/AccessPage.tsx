import { useState } from "react";
import { api, send } from "../api";
import { useAsync } from "../useAsync";
import { capabilities } from "../capabilities";
import { useAuth } from "../auth";
import { when } from "../format";
import { Badge, Empty, Panel, SkeletonTable, Updating } from "../components/ui";
import { ErrorNote } from "../components/ErrorNote";
import { Dialog, DialogSection } from "../components/Dialog";
import type { AdminTokenRow, CreatedAdminToken } from "../types";

/**
 * Admin access management. Tokens are per person and carry either read-only or
 * read+write scope; the plaintext is shown exactly once, at creation.
 */
export function AccessPage() {
  const tokens = useAsync(() => api<AdminTokenRow[]>("/admin/tokens"), [], "admin:tokens");
  const caps = useAsync(capabilities, [], "admin:capabilities");
  const { mode } = useAuth();
  const canWrite = caps.data?.can_write !== false;
  const [creating, setCreating] = useState(false);
  const [issued, setIssued] = useState<CreatedAdminToken | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const rows = tokens.data ?? [];

  async function revoke(row: AdminTokenRow) {
    if (!window.confirm(`Revoke admin token "${row.name}"? That user loses access immediately.`)) {
      return;
    }
    try {
      await send("POST", `/admin/tokens/${row.id}/revoke`);
      setNote(`Revoked ${row.name}.`);
      await tokens.reload();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Could not revoke the token.");
    }
  }

  return (
    <>
      <header className="page-head page-head-titled">
        <div className="page-head-titles">
          <h1>Access</h1>
          <p className="page-sub">
            Admin tokens identify people who can read or change this gateway. Give everyone
            their own token so access is revocable without rotating the bootstrap token.
          </p>
        </div>
        <button
          type="button"
          className="primary"
          onClick={() => setCreating(true)}
          disabled={!canWrite}
          title={canWrite ? undefined : "This token is read-only"}
        >
          Create token
        </button>
      </header>

      {!canWrite ? (
        <p className="note page-note" role="note">
          This token is read-only. Creating and revoking admin tokens is disabled.
        </p>
      ) : null}
      {mode === "proxy" ? (
        <p className="note page-note" role="note">
          This console is behind an SSO proxy. Per-user admin tokens are bypassed for
          <code>/admin/**</code>; access is controlled by the proxy's identity and scope settings.
        </p>
      ) : null}
      {note ? (
        <p className="note page-note" role="status">
          {note}
        </p>
      ) : null}

      {issued ? (
        <Panel title="New token" hint="shown once">
          <div className="settings-body">
            <p className="muted">
              Give this token to <strong>{issued.name}</strong>. It cannot be shown again.
            </p>
            <p className="note mono" style={{ wordBreak: "break-all" }}>
              {issued.token}{" "}
              <button
                type="button"
                className="ghost"
                onClick={() => navigator.clipboard.writeText(issued.token)}
              >
                Copy
              </button>
            </p>
          </div>
        </Panel>
      ) : null}

      <Panel
        title="Admin tokens"
        hint="read-only tokens can GET but not mutate"
        actions={tokens.loading && tokens.data ? <Updating label="Refreshing tokens…" /> : undefined}
      >
        {tokens.loading && !tokens.data ? (
          <SkeletonTable rows={4} columns={5} />
        ) : tokens.error ? (
          <ErrorNote error={tokens.error} />
        ) : rows.length === 0 ? (
          <Empty title="No admin tokens yet">
            Create one token per person. The bootstrap <code>GATEWAY_ADMIN_TOKEN</code> is
            separate and always has full access.
          </Empty>
        ) : (
          <table className="page-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Scopes</th>
                <th scope="col">Masked token</th>
                <th scope="col">State</th>
                <th scope="col">Created</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {rows.map((token) => (
                <tr key={token.id}>
                  <td>{token.name}</td>
                  <td>
                    <Badge tone={token.scopes.includes("write") ? "info" : "neutral"}>
                      {token.scopes}
                    </Badge>
                  </td>
                  <td className="muted mono">{token.masked_token}</td>
                  <td>
                    <Badge tone={token.enabled ? "good" : "neutral"}>
                      {token.enabled ? "active" : "revoked"}
                    </Badge>
                  </td>
                  <td className="muted">{when(token.created_at)}</td>
                  <td className="actions">
                    <button
                      type="button"
                      className="ghost"
                      disabled={!canWrite || !token.enabled}
                      onClick={() => revoke(token)}
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      {creating ? (
        <CreateTokenDialog
          onClose={() => setCreating(false)}
          onCreated={(created) => {
            setCreating(false);
            setIssued(created);
            setNote(`Created ${created.name} with scope ${created.scopes}.`);
            tokens.reload();
          }}
        />
      ) : null}
    </>
  );
}

function CreateTokenDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (created: CreatedAdminToken) => void;
}) {
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState("read");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = Boolean(name.trim());

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError("A token name is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await send<CreatedAdminToken>("POST", "/admin/tokens", {
        name: name.trim(),
        scopes,
      });
      onCreated(created);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the token.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      title="Create admin token"
      lede="One token per person. Read-only is the safe default; grant write only when the person needs to change configuration."
      onClose={onClose}
      onSubmit={submit}
      summary={
        ready
          ? `${name.trim()} · ${scopes === "read" ? "read-only" : "read and write"}`
          : "Enter a name to create this token."
      }
      summaryDim={!ready}
      error={error}
      actions={
        <>
          <button type="button" className="dlg-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="dlg-primary" disabled={busy || !ready}>
            {busy ? "Creating…" : "Create token"}
          </button>
        </>
      }
    >
      <DialogSection label="Token" note="secret is shown once">
        <div className="dlg-grid two">
          <div className="dlg-field">
            <label htmlFor="token-name">
              Name <em>*</em>
            </label>
            <input
              id="token-name"
              className="dlg-input"
              value={name}
              placeholder="alice-readonly"
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              autoComplete="off"
              spellCheck={false}
            />
            <small>Use the person's name so the audit trail is readable.</small>
          </div>
          <div className="dlg-field">
            <label htmlFor="token-scopes">Scopes</label>
            <select
              id="token-scopes"
              className="dlg-input"
              value={scopes}
              onChange={(e) => setScopes(e.target.value)}
            >
              <option value="read">read — view only</option>
              <option value="read,write">read,write — full admin</option>
            </select>
            <small>Read-only can see configuration and usage, never change it.</small>
          </div>
        </div>
      </DialogSection>
    </Dialog>
  );
}
