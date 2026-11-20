import { useState } from "react";
import { api, send } from "../api";
import { useAsync } from "../useAsync";
import { usd, when } from "../format";
import { Badge, Empty, Loading, Panel } from "../components/ui";
import { ErrorNote } from "../components/ErrorNote";
import { Fields, toPayload, useForm, type FieldSpec } from "../components/form";
import { Dialog, DialogActions, DialogSection, DialogSummary } from "../components/Dialog";
import type { KeyRow } from "../types";

const IDENTITY: FieldSpec[] = [
  { name: "name", label: "Name", required: true, wide: true, placeholder: "checkout-service" },
  {
    name: "allowed_models",
    label: "Allowed models",
    wide: true,
    placeholder: "gpt-4o-mini, claude-*, cheap",
    hint: "comma separated ids, aliases or globs — blank allows every model",
  },
];
const SPEND: FieldSpec[] = [
  { name: "credit_limit_usd", label: "Credit limit", type: "number", suffix: "USD", hint: "blank = unlimited" },
  { name: "daily_limit_usd", label: "Daily limit", type: "number", suffix: "USD" },
  { name: "monthly_limit_usd", label: "Monthly limit", type: "number", suffix: "USD" },
  { name: "end_user_daily_limit_usd", label: "Per end user / day", type: "number", suffix: "USD" },
];
const LIMITS: FieldSpec[] = [
  { name: "rpm_limit", label: "Requests / minute", type: "number", hint: "defaults to the gateway value" },
  { name: "max_concurrent_requests", label: "Max concurrent", type: "number" },
  { name: "max_output_tokens", label: "Max output tokens", type: "number", suffix: "tokens", hint: "clamps max_tokens" },
];
const SPEC: FieldSpec[] = [...IDENTITY, ...SPEND, ...LIMITS];

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
        <Dialog
          title="New client key"
          lede="The key is shown once after creation. Budgets and limits are optional; a blank limit means no cap, and per-key limits apply in addition to the project's."
          onClose={() => setCreating(false)}
          onSubmit={(event) => {
            event.preventDefault();
            create();
          }}
          footer={
            <>
              <DialogSummary dim={!form.values.name?.trim()}>
                {form.values.name?.trim()
                  ? `${form.values.name.trim()}${
                      form.values.credit_limit_usd ? ` · $${form.values.credit_limit_usd} credit` : ""
                    }${form.values.rpm_limit ? ` · ${form.values.rpm_limit} rpm` : ""}`
                  : "Name the key to create it."}
              </DialogSummary>
              {form.error ? <ErrorNote error={form.error} /> : null}
              <DialogActions>
                <button type="button" className="dlg-secondary" onClick={() => setCreating(false)}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="dlg-primary"
                  disabled={form.busy || !form.values.name?.trim()}
                >
                  {form.busy ? "Creating…" : "Create key"}
                </button>
              </DialogActions>
            </>
          }
        >
          <DialogSection label="Identity">
            <Fields spec={IDENTITY} form={form} />
          </DialogSection>
          <DialogSection label="Spend" note="blank means no cap">
            <Fields spec={SPEND} form={form} />
          </DialogSection>
          <DialogSection label="Rate and size limits">
            <Fields spec={LIMITS} form={form} columns={3} />
          </DialogSection>
        </Dialog>
      ) : null}

      {topUp ? (
        <Dialog
          title={`Top up ${topUp.name}`}
          lede="Credit is added to the key immediately. Spend history and limits are unchanged."
          onClose={() => setTopUp(null)}
          onSubmit={(event) => {
            event.preventDefault();
            topUpKey();
          }}
          footer={
            <>
              <DialogSummary dim={!amount.trim()}>
                {amount.trim() ? `+$${amount} to ${topUp.name}` : "Enter an amount."}
              </DialogSummary>
              <DialogActions>
                <button type="button" className="dlg-secondary" onClick={() => setTopUp(null)}>
                  Cancel
                </button>
                <button type="submit" className="dlg-primary" disabled={!amount.trim()}>
                  Add credit
                </button>
              </DialogActions>
            </>
          }
        >
          <DialogSection label="Amount">
            <label className="field">
              <span>Amount (USD)</span>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                aria-label="Amount in US dollars"
              />
            </label>
          </DialogSection>
        </Dialog>
      ) : null}
    </>
  );
}
