import { useState } from "react";
import { api, send } from "../api";
import { useAsync } from "../useAsync";
import { usd, when } from "../format";
import { Badge, Empty, Loading, Panel } from "../components/ui";
import { ErrorNote } from "../components/ErrorNote";
import { Fields, Modal, toPayload, useForm, type FieldSpec } from "../components/form";
import type { KeyRow } from "../types";

const SPEC: FieldSpec[] = [
  { name: "name", label: "Name", required: true, placeholder: "checkout-service" },
  { name: "credit_limit_usd", label: "Credit limit (USD)", type: "number", hint: "blank = unlimited" },
  { name: "daily_limit_usd", label: "Daily limit (USD)", type: "number" },
  { name: "monthly_limit_usd", label: "Monthly limit (USD)", type: "number" },
  { name: "end_user_daily_limit_usd", label: "Per end user / day (USD)", type: "number" },
  { name: "rpm_limit", label: "Requests / minute", type: "number" },
  { name: "max_concurrent_requests", label: "Max concurrent", type: "number" },
  { name: "max_output_tokens", label: "Max output tokens", type: "number" },
  { name: "allowed_models", label: "Allowed models", wide: true, hint: "comma separated ids or globs, blank = all" },
];

export function KeysPage() {
  const keys = useAsync(() => api<KeyRow[]>("/admin/keys"), []);
  const form = useForm({});
  const [creating, setCreating] = useState(false);
  const [topUp, setTopUp] = useState<KeyRow | null>(null);
  const [amount, setAmount] = useState("10");
  const [note, setNote] = useState<string | null>(null);
  const [issued, setIssued] = useState<string | null>(null);

  async function create() {
    form.setBusy(true);
    form.setError(null);
    try {
      const payload = toPayload(SPEC, form.values);
      const created = await send<{ key: string }>("POST", "/admin/keys", payload);
      setIssued(created.key);
      setCreating(false);
      form.reset({});
      setNote("Key created. Copy it now — it is shown once.");
      await keys.reload();
    } catch (e) {
      form.setError(e);
    } finally {
      form.setBusy(false);
    }
  }

  async function topUpKey() {
    if (!topUp) return;
    try {
      await send("POST", `/admin/keys/${topUp.id}/topup`, { amount_usd: Number(amount) });
      setNote(`Topped up ${topUp.name} by $${amount}.`);
      setTopUp(null);
      await keys.reload();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Top-up failed");
    }
  }

  async function revoke(row: KeyRow) {
    if (!window.confirm(`Revoke "${row.name}"? Requests using it start failing immediately.`)) return;
    try {
      await send("POST", `/admin/keys/${row.id}/revoke`);
      setNote(`${row.name} revoked.`);
      await keys.reload();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Revoke failed");
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>Keys</h1>
        <button className="primary" onClick={() => { form.reset({}); setIssued(null); setCreating(true); }}>
          New key
        </button>
      </div>
      {note ? <p className="note">{note}</p> : null}
      {issued ? (
        <p className="note mono">
          {issued}{" "}
          <button className="ghost" onClick={() => navigator.clipboard.writeText(issued)}>
            Copy
          </button>
        </p>
      ) : null}
      <Panel title="Client keys" hint="what your applications authenticate with">
        {keys.loading ? (
          <Loading />
        ) : keys.error ? (
          <ErrorNote error={keys.error} />
        ) : (keys.data ?? []).length === 0 ? (
          <Empty>No keys yet.</Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Prefix</th>
                <th className="right">Credit</th>
                <th className="right">Used</th>
                <th className="right">Daily</th>
                <th className="right">End user/day</th>
                <th className="right">RPM</th>
                <th>Last used</th>
                <th>State</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(keys.data ?? []).map((k) => (
                <tr key={k.id}>
                  <td>{k.name}</td>
                  <td className="muted mono">{k.prefix ?? "—"}</td>
                  <td className="right">{usd(k.credit_limit_usd)}</td>
                  <td className="right">{usd(k.used_usd)}</td>
                  <td className="right">{usd(k.daily_limit_usd)}</td>
                  <td className="right">{usd(k.end_user_daily_limit_usd)}</td>
                  <td className="right">{k.rpm_limit ?? "—"}</td>
                  <td className="muted">{when(k.last_used_at)}</td>
                  <td><Badge tone={k.enabled ? "good" : "neutral"}>{k.enabled ? "active" : "revoked"}</Badge></td>
                  <td className="actions">
                    <button className="ghost" onClick={() => { setTopUp(k); setAmount("10"); }}>Top up</button>
                    {k.enabled ? (
                      <button className="danger" onClick={() => revoke(k)}>Revoke</button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      {creating ? (
        <Modal title="New client key" onClose={() => setCreating(false)}>
          <Fields spec={SPEC} form={form} />
          {form.error ? <ErrorNote error={form.error} /> : null}
          <div className="modal-actions">
            <button className="ghost" onClick={() => setCreating(false)}>Cancel</button>
            <button className="primary" disabled={form.busy} onClick={create}>
              {form.busy ? "Creating…" : "Create key"}
            </button>
          </div>
        </Modal>
      ) : null}

      {topUp ? (
        <Modal title={`Top up ${topUp.name}`} onClose={() => setTopUp(null)}>
          <label className="field">
            <span>Amount (USD)</span>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
          </label>
          <div className="modal-actions">
            <button className="ghost" onClick={() => setTopUp(null)}>Cancel</button>
            <button className="primary" onClick={topUpKey}>Add credit</button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
