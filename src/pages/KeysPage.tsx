import { useState } from "react";
import { api, send } from "../api";
import { useAsync } from "../useAsync";
import { capabilities } from "../capabilities";
import { usd, when } from "../format";
import { Badge, Empty, Panel, SkeletonTable, Updating } from "../components/ui";
import { ErrorNote } from "../components/ErrorNote";
import {
  Fields,
  focusFirstError,
  toPayload,
  useForm,
  type FieldSpec,
} from "../components/form";
import { Dialog, DialogSection } from "../components/Dialog";
import type { KeyRow } from "../types";

const IDENTITY: FieldSpec[] = [
  {
    name: "name",
    label: "Name",
    required: true,
    wide: true,
    placeholder: "checkout-service",
    hint: "shown in usage and budget alerts",
  },
  {
    name: "allowed_models",
    label: "Allowed models",
    wide: true,
    placeholder: "gpt-4o-mini, claude-*, cheap",
    hint: "comma separated ids, aliases or globs — blank allows every model",
  },
];

/** Money caps. Two tracks, four fields: two full rows, no orphan cell. */
const BUDGETS: FieldSpec[] = [
  {
    name: "credit_limit_usd",
    label: "Total credit limit",
    type: "number",
    suffix: "USD",
    placeholder: "unlimited",
    hint: "lifetime spend cap for this key",
  },
  {
    name: "daily_limit_usd",
    label: "Daily spend limit",
    type: "number",
    suffix: "USD",
    placeholder: "unlimited",
    hint: "resets every 24 hours",
  },
  {
    name: "monthly_limit_usd",
    label: "Monthly spend limit",
    type: "number",
    suffix: "USD",
    placeholder: "unlimited",
    hint: "resets on the 1st",
  },
  {
    name: "end_user_daily_limit_usd",
    label: "Per end user, per day",
    type: "number",
    suffix: "USD",
    placeholder: "unlimited",
    hint: "requires an end-user id on requests",
  },
];

/** Three tracks, three fields: exactly one row. */
const LIMITS: FieldSpec[] = [
  {
    name: "rpm_limit",
    label: "Requests per minute",
    type: "number",
    inputMode: "numeric",
    placeholder: "gateway default",
    hint: "blank uses the gateway value",
  },
  {
    name: "max_concurrent_requests",
    label: "Concurrent requests",
    type: "number",
    inputMode: "numeric",
    placeholder: "no cap",
    hint: "in flight at once",
  },
  {
    name: "max_output_tokens",
    label: "Max output tokens",
    type: "number",
    inputMode: "numeric",
    suffix: "tokens",
    placeholder: "no cap",
    hint: "clamps max_tokens",
  },
];

const SPEC: FieldSpec[] = [...IDENTITY, ...BUDGETS, ...LIMITS];

export function KeysPage() {
  const keys = useAsync(() => api<KeyRow[]>("/admin/keys"), [], "admin:keys");
  const caps = useAsync(capabilities, [], "admin:capabilities");
  const canWrite = caps.data?.can_write !== false;
  const readOnlyHint = canWrite ? undefined : "This token is read-only";
  const form = useForm({});
  const [creating, setCreating] = useState(false);
  const [topUp, setTopUp] = useState<KeyRow | null>(null);
  const [amount, setAmount] = useState("10");
  const [amountError, setAmountError] = useState<string | null>(null);
  const [topUpError, setTopUpError] = useState<unknown>(null);
  const [note, setNote] = useState<string | null>(null);
  const [issued, setIssued] = useState<string | null>(null);

  async function create() {
    if (!form.validate(SPEC)) {
      focusFirstError();
      return;
    }

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

  function openTopUp(row: KeyRow) {
    setTopUp(row);
    setAmount("10");
    setAmountError(null);
    setTopUpError(null);
  }

  async function topUpKey() {
    if (!topUp) return;
    const value = Number(amount.trim());
    if (amount.trim() === "" || !Number.isFinite(value) || value <= 0) {
      setAmountError("Enter an amount greater than zero.");
      focusFirstError();
      return;
    }

    setTopUpError(null);
    try {
      await send("POST", `/admin/keys/${topUp.id}/topup`, { amount_usd: Number(amount) });
      setNote(`Topped up ${topUp.name} by ${usd(Number(amount))}.`);
      setTopUp(null);
      await keys.reload();
    } catch (e) {
      setTopUpError(e);
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

  const keyName = form.values.name?.trim() ?? "";
  const credit = form.values.credit_limit_usd?.trim() ?? "";
  const rpm = form.values.rpm_limit?.trim() ?? "";
  const keySummary = keyName
    ? `${keyName} · ${credit ? `${usd(Number(credit))} credit cap` : "no credit cap"}${
        rpm ? ` · ${rpm} requests/min` : ""
      }${form.values.allowed_models?.trim() ? " · model allowlist" : ""}`
    : "Name the key to create it.";

  const topUpAmount = Number(amount.trim());
  const topUpValid = amount.trim() !== "" && Number.isFinite(topUpAmount) && topUpAmount > 0;
  const topUpSummary = topUp
    ? topUpValid
      ? `+${usd(topUpAmount)} → ${topUp.name}${
          topUp.credit_limit_usd != null ? ` · credit cap ${usd(topUp.credit_limit_usd)}` : " · no credit cap"
        }`
      : "Enter the credit to add."
    : "";

  return (
    <>
      <div className="page-head page-head-titled">
        <div className="page-head-titles">
          <h1>Client keys</h1>
          <p className="page-sub">
            What applications authenticate with. Each key carries its own budgets, rate limits
            and model allowlist, in addition to its project's caps.
          </p>
        </div>
        <button
          type="button"
          className="primary"
          onClick={() => {
            form.reset({});
            setIssued(null);
            setCreating(true);
          }}
          disabled={!canWrite}
          title={readOnlyHint}
        >
          New key
        </button>
      </div>
      {!canWrite ? (
        <p className="note" role="note">
          This token is read-only. Creating keys, topping up and revoking are disabled.
        </p>
      ) : null}
      {note ? <p className="note">{note}</p> : null}
      {issued ? (
        <p className="note mono">
          {issued}{" "}
          <button type="button" className="ghost" onClick={() => navigator.clipboard.writeText(issued)}>
            Copy
          </button>
        </p>
      ) : null}
      <Panel
        title="Client keys"
        hint="what your applications authenticate with"
        actions={keys.loading && keys.data ? <Updating label="Refreshing keys…" /> : undefined}
      >
        {keys.loading && !keys.data ? (
          <SkeletonTable rows={5} columns={8} />
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
                  <td>
                    <Badge tone={k.enabled ? "good" : "neutral"}>{k.enabled ? "active" : "revoked"}</Badge>
                  </td>
                  <td className="actions">
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => openTopUp(k)}
                      disabled={!canWrite}
                      title={readOnlyHint}
                    >
                      Top up
                    </button>
                    {k.enabled ? (
                      <button
                        type="button"
                        className="danger"
                        onClick={() => revoke(k)}
                        disabled={!canWrite}
                        title={readOnlyHint}
                      >
                        Revoke
                      </button>
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
          lede="Shown once after creation. Budgets and limits are optional; per-key limits apply in addition to the project's."
          onClose={() => setCreating(false)}
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
          summary={keySummary}
          summaryDim={!keyName}
          error={form.error}
          actions={
            <>
              <button type="button" className="dlg-secondary" onClick={() => setCreating(false)}>
                Cancel
              </button>
              <button type="submit" className="dlg-primary" disabled={form.busy}>
                {form.busy ? "Creating…" : "Create key"}
              </button>
            </>
          }
        >
          <DialogSection label="Identity">
            <Fields spec={IDENTITY} form={form} />
          </DialogSection>
          <DialogSection label="Budget caps" note="blank means no cap">
            <Fields spec={BUDGETS} form={form} />
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
            void topUpKey();
          }}
          summary={topUpSummary}
          summaryDim={!topUpValid}
          error={topUpError}
          actions={
            <>
              <button type="button" className="dlg-secondary" onClick={() => setTopUp(null)}>
                Cancel
              </button>
              <button type="submit" className="dlg-primary">
                Add credit
              </button>
            </>
          }
        >
          <DialogSection label="Amount" note={`current credit cap ${usd(topUp.credit_limit_usd)}`}>
            <div className="dlg-field">
              <label htmlFor="topup-amount">
                Amount to add <em>*</em>
              </label>
              <span className="dlg-number">
                <input
                  id="topup-amount"
                  className="dlg-input"
                  inputMode="decimal"
                  value={amount}
                  placeholder="10.00"
                  aria-invalid={amountError ? true : undefined}
                  aria-describedby={amountError ? "topup-amount-error" : "topup-amount-hint"}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    if (amountError) setAmountError(null);
                    if (topUpError) setTopUpError(null);
                  }}
                  autoComplete="off"
                />
                <span className="suffix" aria-hidden="true">
                  USD
                </span>
              </span>
              {amountError ? (
                <small className="fld-error" id="topup-amount-error" role="alert">
                  {amountError}
                </small>
              ) : (
                <small id="topup-amount-hint">added to the key's available credit</small>
              )}
            </div>
          </DialogSection>
        </Dialog>
      ) : null}
    </>
  );
}
