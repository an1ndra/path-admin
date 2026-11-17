import { useState } from "react";
import { api, send } from "../api";
import { useAsync } from "../useAsync";
import { Badge, Loading, Panel } from "../components/ui";
import { ErrorNote } from "../components/ErrorNote";
import { Fields, useForm, type FieldSpec } from "../components/form";

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

const SPEC: FieldSpec[] = [
  { name: "host", label: "SMTP host", placeholder: "smtp.postmarkapp.com", wide: true },
  { name: "port", label: "Port", type: "number", placeholder: "587" },
  {
    name: "username",
    label: "Username",
    placeholder: "usually the API token or the mailbox user",
  },
  {
    name: "password",
    label: "Password",
    type: "password",
    hint: "stored encrypted; blank keeps the current one, - clears it",
  },
  { name: "from", label: "From address", placeholder: "path@example.com" },
  { name: "to", label: "Recipients", wide: true, hint: "comma separated" },
];

export function SettingsPage() {
  const mail = useAsync(() => api<MailSettings>("/admin/mail-settings"), []);
  const form = useForm({});
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    form.setBusy(true);
    form.setError(null);
    setNote(null);
    try {
      const payload: Record<string, unknown> = {};
      for (const field of SPEC) {
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
    } catch (e) {
      form.setError(e);
    } finally {
      form.setBusy(false);
    }
  }

  async function disable() {
    try {
      await send("PUT", "/admin/mail-settings", { enabled: false });
      setNote("Email alerting disabled. The configuration is kept.");
      await mail.reload();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Failed");
    }
  }

  async function test() {
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

  const current = mail.data;

  return (
    <>
      <h1>Settings</h1>
      {note ? <p className="note">{note}</p> : null}

      <Panel title="Alert email" hint={current ? `source: ${current.source}` : undefined}>
        {mail.loading ? (
          <Loading />
        ) : mail.error ? (
          <ErrorNote error={mail.error} />
        ) : (
          <div className="settings-body">
            <p className="muted">
              {current?.configured ? (
                <>
                  <Badge tone="good">on</Badge> {current.host}:{current.port ?? 587} →{" "}
                  {current.to} <span className="muted">· password {current.has_password ? "stored" : "not set"}</span>
                </>
              ) : (
                <>
                  <Badge tone="neutral">off</Badge> alerts go nowhere until this is configured
                </>
              )}
            </p>

            <Fields spec={SPEC} form={form} />
            {form.error ? <ErrorNote error={form.error} /> : null}

            <div className="modal-actions">
              {current?.configured ? (
                <button className="ghost" onClick={disable}>
                  Disable
                </button>
              ) : null}
              <button className="ghost" disabled={busy} onClick={test}>
                Send test email
              </button>
              <button className="primary" disabled={form.busy} onClick={save}>
                {form.busy ? "Saving…" : "Save"}
              </button>
            </div>
            <p className="muted small">
              Alerts also cover budget thresholds, provider circuits and project budgets. The
              webhook channel is separate and stays configured by environment.
            </p>
          </div>
        )}
      </Panel>
    </>
  );
}
