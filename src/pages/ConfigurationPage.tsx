import { useState } from "react";
import { api, send } from "../api";
import { useAsync } from "../useAsync";
import { Badge, Loading, Panel } from "../components/ui";
import { ErrorNote } from "../components/ErrorNote";
import { Fields, useForm, type FieldSpec } from "../components/form";
import { Dialog, DialogActions, DialogSection, DialogSummary } from "../components/Dialog";
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

const MAIL_SERVER: FieldSpec[] = [
  { name: "host", label: "SMTP host", placeholder: "smtp.postmarkapp.com", wide: true },
  { name: "port", label: "Port", type: "number", placeholder: "587" },
  {
    name: "username",
    label: "Username",
    placeholder: "API token or mailbox user",
  },
  {
    name: "password",
    label: "Password",
    type: "password",
    hint: "blank keeps the stored one; - clears it",
  },
];
const MAIL_DELIVERY: FieldSpec[] = [
  { name: "from", label: "From address", wide: true, placeholder: "path@example.com" },
  { name: "to", label: "Recipients", wide: true, hint: "comma separated" },
];
const MAIL_SPEC: FieldSpec[] = [...MAIL_SERVER, ...MAIL_DELIVERY];

/** Gateway switches and delivery. Account and token live on Settings. */
export function ConfigurationPage() {
  const settings = useAsync(() => api<GatewaySettings>("/admin/settings"), []);
  const mail = useAsync(() => api<MailSettings>("/admin/mail-settings"), []);
  const form = useForm({});
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [digest, setDigest] = useState<{ subject?: string; text?: string; reason?: string } | null>(null);
  const [mailOpen, setMailOpen] = useState(false);

  async function saveMail() {
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

  const currentMail = mail.data;
  const gw = settings.data;

  return (
    <>
      <h1>Configuration</h1>
      {note ? <p className="note">{note}</p> : null}

      <Panel title="Gateway" hint={gw?.auth_mode === "proxy" ? "SSO proxy" : "token auth"}>
        {settings.loading ? (
          <Loading />
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

      <Panel title="Guardrails" hint="read-only here; set by environment">
        {settings.loading ? (
          <Loading />
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

      <Panel title="Alert email" hint={currentMail ? `source: ${currentMail.source}` : undefined}>
        {mail.loading ? (
          <Loading />
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
                <button className="ghost" onClick={disableMail}>
                  Disable
                </button>
              ) : null}
              <button className="ghost" disabled={busy} onClick={testAlert}>
                Send test alert
              </button>
              <button className="primary" onClick={() => setMailOpen(true)}>
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
            <button className="ghost" disabled={busy} onClick={testDigest}>
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
          lede="Alerts are sent through this SMTP server. The password is encrypted and write-only; a blank field keeps the stored one."
          onClose={() => setMailOpen(false)}
          onSubmit={(event) => {
            event.preventDefault();
            saveMail();
          }}
          footer={
            <>
              <DialogSummary
                dim={!((form.values.host?.trim() || currentMail?.host) && (form.values.to?.trim() || currentMail?.to))}
              >
                {`${form.values.host?.trim() || currentMail?.host || "smtp host"}:${
                  form.values.port || currentMail?.port || 587
                } → ${form.values.to?.trim() || currentMail?.to || "no recipients"}`}
              </DialogSummary>
              {form.error ? <ErrorNote error={form.error} /> : null}
              <DialogActions>
                <button type="button" className="dlg-secondary" onClick={() => setMailOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="dlg-primary" disabled={form.busy}>
                  {form.busy ? "Saving…" : "Save"}
                </button>
              </DialogActions>
            </>
          }
        >
          <DialogSection label="SMTP server">
            <Fields spec={MAIL_SERVER} form={form} columns={3} />
          </DialogSection>
          <DialogSection label="Delivery">
            <Fields spec={MAIL_DELIVERY} form={form} />
          </DialogSection>
        </Dialog>
      ) : null}
    </>
  );
}
