import { useState } from "react";
import { api, send } from "../api";
import { useAsync } from "../useAsync";
import { capabilities } from "../capabilities";
import { Badge, Panel, SkeletonFacts, Updating } from "../components/ui";
import { ErrorNote } from "../components/ErrorNote";
import {
  Fields,
  focusFirstError,
  useForm,
  type Errors,
  type FieldSpec,
} from "../components/form";
import { Dialog, DialogSection } from "../components/Dialog";
import type { GatewaySettings } from "../types";

interface MailSettings {
  configured: boolean;
  source: "console" | "environment" | "none";
  host?: string | null;
  port?: number | null;
  username?: string | null;
  from?: string | null;
  to?: string | null;
  has_password: boolean;
  updated_at?: string | null;
}

/** Payload fields. Names and types are the API contract; only the copy changes. */
const MAIL_SPEC: FieldSpec[] = [
  { name: "host", label: "SMTP host", wide: true },
  { name: "port", label: "Port", type: "number" },
  { name: "username", label: "Username" },
  { name: "password", label: "Password", type: "password" },
  { name: "from", label: "From address", type: "email" },
  { name: "to", label: "Recipients" },
];

/** What the form shows: same field names, with the stored value in each hint. */
function mailSections(current: MailSettings | null | undefined): {
  server: FieldSpec[];
  delivery: FieldSpec[];
} {
  const server: FieldSpec[] = [
    {
      name: "host",
      label: "SMTP host",
      wide: true,
      required: !current?.host,
      placeholder: "smtp.postmarkapp.com",
      hint: current?.host ? `stored: ${current.host}` : "not set yet",
    },
    {
      name: "port",
      label: "Port",
      type: "number",
      inputMode: "numeric",
      placeholder: "587",
      hint: current?.port ? `stored: ${current.port}` : "blank uses 587",
    },
    {
      name: "username",
      label: "Username",
      placeholder: "API token or mailbox user",
      hint: current?.username ? `stored: ${current.username}` : "optional",
    },
    {
      name: "password",
      label: "Password",
      type: "password",
      autoComplete: "new-password",
      placeholder: current?.has_password ? "stored — leave blank to keep" : "not set",
      hint: "blank keeps it; - clears it",
    },
  ];
  const delivery: FieldSpec[] = [
    {
      name: "from",
      label: "From address",
      type: "email",
      placeholder: "path@example.com",
      hint: current?.from ? `stored: ${current.from}` : "sender shown in the inbox",
    },
    {
      name: "to",
      label: "Recipients",
      inputMode: "email",
      required: !current?.to,
      placeholder: "ops@example.com",
      hint: "comma separated addresses",
    },
  ];
  return { server, delivery };
}

/** Gateway switches and delivery. Account and token live on Settings. */
export function ConfigurationPage() {
  const settings = useAsync(() => api<GatewaySettings>("/admin/settings"), [], "admin:settings");
  const caps = useAsync(capabilities, [], "admin:capabilities");
  const canWrite = caps.data?.can_write !== false;
  const readOnlyHint = canWrite ? undefined : "This token is read-only";
  const mail = useAsync(() => api<MailSettings>("/admin/mail-settings"), [], "admin:mail-settings");
  const form = useForm({});
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [digest, setDigest] = useState<{ subject?: string; text?: string; reason?: string } | null>(null);
  const [mailOpen, setMailOpen] = useState(false);

  const currentMail = mail.data;
  const gw = settings.data;

  async function saveMail(): Promise<boolean> {
    const { server, delivery } = mailSections(currentMail);
    const valid = form.validate([...server, ...delivery], (values): Errors => {
      const errors: Errors = {};
      if (!(values.host?.trim() || currentMail?.host)) {
        errors.host = "A host is required.";
      }
      if (!(values.to?.trim() || currentMail?.to)) {
        errors.to = "At least one recipient is required.";
      }
      const port = (values.port ?? "").trim();
      if (port !== "") {
        const n = Number(port);
        if (!Number.isFinite(n) || n < 1 || n > 65535) errors.port = "Use a port from 1 to 65535.";
      }
      return errors;
    });
    if (!valid) {
      focusFirstError();
      return false;
    }

    form.setBusy(true);
    form.setError(null);
    setNote(null);
    try {
      const payload: Record<string, unknown> = {};
      for (const field of MAIL_SPEC) {
        const raw = form.values[field.name];
        if (raw === undefined || raw === "") continue;
        payload[field.name] = field.type === "number" ? Number(raw) : raw;
      }
      payload.enabled = true;
      const saved = await send<MailSettings>("PUT", "/admin/mail-settings", payload);
      form.reset({});
      setNote(
        saved.configured
          ? `Saved. Alert email goes to ${saved.to} via ${saved.host}:${saved.port ?? 587}.`
          : "Saved, but email alerting is off.",
      );
      await mail.reload();
      setMailOpen(false);
      return true;
    } catch (e) {
      form.setError(e);
      return false;
    } finally {
      form.setBusy(false);
    }
  }

  async function disableMail() {
    try {
      await send("PUT", "/admin/mail-settings", { enabled: false });
      setNote("Email alerting disabled. The configuration is kept.");
      await mail.reload();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Failed");
    }
  }

  async function testAlert() {
    setBusy(true);
    setNote("Sending…");
    try {
      const result = await send<{ email: boolean; webhook: boolean }>("POST", "/admin/alerts/test");
      setNote(
        result.email
          ? "Test email sent — check the mailbox."
          : "No email channel is configured yet, so nothing was sent.",
      );
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function testDigest() {
    setBusy(true);
    setNote(null);
    setDigest(null);
    try {
      const result = await send<{ sent: boolean; subject?: string; text?: string; reason?: string }>(
        "POST",
        "/admin/digest/test",
      );
      setDigest(result);
      setNote(
        result.sent
          ? "Digest sent — the rendered text is below."
          : result.reason === "no_traffic"
            ? "Yesterday had no traffic, so no digest was sent."
            : `Digest not sent (${result.reason ?? "unknown"}).`,
      );
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  const { server: mailServer, delivery: mailDelivery } = mailSections(currentMail);

  const effHost = form.values.host?.trim() || currentMail?.host || "";
  const effPort = form.values.port?.trim() || String(currentMail?.port ?? 587);
  const effTo = form.values.to?.trim() || currentMail?.to || "";
  // A field counts as new only when it differs from what is actually stored;
  // the password is write-only, so any value typed there replaces the secret.
  const differs = (name: string, stored: string | number | null | undefined) => {
    const value = (form.values[name] ?? "").trim();
    return value !== "" && value !== String(stored ?? "");
  };
  const changed =
    differs("host", currentMail?.host) ||
    differs("port", currentMail?.port) ||
    differs("username", currentMail?.username) ||
    differs("from", currentMail?.from) ||
    differs("to", currentMail?.to) ||
    (form.values.password ?? "").trim() !== "";
  const mailSummary = (
    <>
      <span className={`dlg-flag${changed ? "" : " quiet"}`}>{changed ? "new" : "current"}</span>
      {`${effHost || "smtp host"}:${effPort} → ${effTo || "no recipients"}`}
    </>
  );

  return (
    <>
      {!canWrite ? (
        <p className="note" role="note">
          This token is read-only. Changing mail settings, sending a test alert or rendering a
          digest are disabled.
        </p>
      ) : null}
      <header className="page-head page-head-titled">
        <div className="page-head-titles">
          <h1>Configuration</h1>
          <p className="page-sub">
            Gateway switches, alert delivery and the daily digest. Everything except email is
            set by environment and shown read-only.
          </p>
        </div>
      </header>
      {note ? <p className="note">{note}</p> : null}

      <Panel
        title="Gateway"
        hint={gw?.auth_mode === "proxy" ? "SSO proxy" : "token auth"}
        actions={settings.loading && settings.data ? <Updating label="Refreshing…" /> : undefined}
      >
        {settings.loading && !settings.data ? (
          <SkeletonFacts rows={7} />
        ) : settings.error ? (
          <ErrorNote error={settings.error} />
        ) : (
          <dl className="facts">
            <div>
              <dt>Auth mode</dt>
              <dd>{gw?.auth_mode ?? "—"}</dd>
            </div>
            <div>
              <dt>Identity</dt>
              <dd>{gw?.subject ?? "bootstrap token"}</dd>
            </div>
            <div>
              <dt>Scopes</dt>
              <dd>
                {(gw?.scopes ?? []).length > 0 ? (
                  (gw?.scopes ?? []).map((scope) => (
                    <Badge key={scope} tone={scope === "write" ? "info" : "neutral"}>
                      {scope}
                    </Badge>
                  ))
                ) : (
                  <span className="muted">—</span>
                )}
              </dd>
            </div>
            <div>
              <dt>Rate-limit backend</dt>
              <dd>{gw?.rate_limit_backend ?? "—"}</dd>
            </div>
            <div>
              <dt>Public catalogue</dt>
              <dd>{gw?.public_models ? "GET /v1/models is open" : "key required"}</dd>
            </div>
            <div>
              <dt>Demo key on first boot</dt>
              <dd>{gw?.demo_key_bootstrap ? "enabled" : "disabled"}</dd>
            </div>
            <div>
              <dt>Prompt logging</dt>
              <dd>{gw?.prompt_logging ? "on (PII store)" : "off"}</dd>
            </div>
          </dl>
        )}
      </Panel>

      <Panel
        title="Guardrails"
        hint="read-only here; set by environment"
        actions={settings.loading && settings.data ? <Updating label="Refreshing…" /> : undefined}
      >
        {settings.loading && !settings.data ? (
          <SkeletonFacts rows={3} />
        ) : (
          <dl className="facts">
            <div>
              <dt>Prompt-log redaction</dt>
              <dd>{gw?.guardrails?.prompt_log_redaction ? "on" : "off"}</dd>
            </div>
            <div>
              <dt>Redact before send</dt>
              <dd>{gw?.guardrails?.redact_before_send ? "on" : "off"}</dd>
            </div>
            <div>
              <dt>Moderation pre-flight</dt>
              <dd>{gw?.guardrails?.moderation ? "on" : "off"}</dd>
            </div>
          </dl>
        )}
      </Panel>

      <Panel
        title="Alert email"
        hint={currentMail ? `source: ${currentMail.source}` : undefined}
        actions={mail.loading && mail.data ? <Updating label="Refreshing…" /> : undefined}
      >
        {mail.loading && !mail.data ? (
          <SkeletonFacts rows={4} />
        ) : mail.error ? (
          <ErrorNote error={mail.error} />
        ) : (
          <div className="settings-body">
            <p className="muted">
              {currentMail?.configured ? (
                <>
                  <Badge tone="good">on</Badge> {currentMail.host}:{currentMail.port ?? 587} →{" "}
                  {currentMail.to}{" "}
                  <span className="muted">
                    · password {currentMail.has_password ? "stored" : "not set"}
                  </span>
                </>
              ) : (
                <>
                  <Badge tone="neutral">off</Badge> alerts go nowhere until this is configured
                </>
              )}
            </p>

            <div className="modal-actions">
              {currentMail?.configured ? (
                <button
                  type="button"
                  className="ghost"
                  onClick={disableMail}
                  disabled={!canWrite}
                  title={readOnlyHint}
                >
                  Disable
                </button>
              ) : null}
              <button
                type="button"
                className="ghost"
                disabled={busy || !canWrite}
                title={readOnlyHint}
                onClick={testAlert}
              >
                Send test alert
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => {
                  form.reset({});
                  setMailOpen(true);
                }}
                disabled={!canWrite}
                title={readOnlyHint}
              >
                {currentMail?.configured ? "Edit email" : "Configure email"}
              </button>
            </div>
            <p className="muted small">
              Covers budget thresholds, provider circuits, provider error rates and the daily
              digest. The webhook channel is separate and stays configured by environment.
            </p>
          </div>
        )}
      </Panel>

      <Panel title="Daily digest" hint="08:00 by default, GATEWAY_DIGEST_CRON">
        <div className="settings-body">
          <p className="muted">
            One email a day with yesterday's requests, spend, tokens, failures and the slowest
            model. It reuses the alert mailbox above and sends nothing for an empty day.
          </p>
          <div className="modal-actions">
            <button
              type="button"
              className="ghost"
              disabled={busy || !canWrite}
              title={readOnlyHint}
              onClick={testDigest}
            >
              {busy ? "Working…" : "Render yesterday's digest"}
            </button>
          </div>
          {digest?.text ? (
            <pre className="digest">{digest.subject ? `${digest.subject}\n\n` : ""}{digest.text}</pre>
          ) : null}
        </div>
      </Panel>

      {mailOpen ? (
        <Dialog
          title={currentMail?.configured ? "Alert email" : "Configure alert email"}
          lede="Alerts are sent through this SMTP server. Blank fields keep the stored value; the password is write-only, and a single '-' clears it."
          onClose={() => setMailOpen(false)}
          onSubmit={(event) => {
            event.preventDefault();
            void saveMail();
          }}
          summary={mailSummary}
          summaryDim={!effHost || !effTo}
          error={form.error}
          actions={
            <>
              <button type="button" className="dlg-secondary" onClick={() => setMailOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="dlg-primary" disabled={form.busy}>
                {form.busy ? "Saving…" : "Save"}
              </button>
            </>
          }
        >
          <DialogSection
            label="SMTP server"
            note={currentMail?.configured ? "saved values shown below" : "not configured yet"}
          >
            <div className="dlg-current">
              <strong>Stored</strong>
              {currentMail?.configured ? (
                <>
                  <span className="mono">
                    {currentMail.host}:{currentMail.port ?? 587}
                  </span>
                  <span>→ {currentMail.to}</span>
                  <span>· password {currentMail.has_password ? "stored" : "not set"}</span>
                  {currentMail.username ? <span>· user {currentMail.username}</span> : null}
                </>
              ) : (
                <span>Nothing stored yet — fill the host and recipients to enable alerting.</span>
              )}
            </div>
            <Fields spec={mailServer} form={form} columns={3} />
          </DialogSection>
          <DialogSection label="Delivery" note="where budget and circuit alerts land">
            <Fields spec={mailDelivery} form={form} />
          </DialogSection>
        </Dialog>
      ) : null}
    </>
  );
}
