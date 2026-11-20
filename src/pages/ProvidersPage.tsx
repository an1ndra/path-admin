import { useState } from "react";
import { api, send } from "../api";
import { useAsync } from "../useAsync";
import { Badge, Empty, Loading, Panel } from "../components/ui";
import { ErrorNote } from "../components/ErrorNote";
import { Fields, toPayload, useForm, type FieldSpec } from "../components/form";
import { Dialog, DialogActions, DialogSection, DialogSummary } from "../components/Dialog";
import type { ProviderRow } from "../types";

const IDENTITY: FieldSpec[] = [
  { name: "slug", label: "Slug", required: true, placeholder: "openai", hint: "the name routes and alerts use" },
  {
    name: "type",
    label: "Wire format",
    type: "select",
    options: [
      { value: "openai", label: "openai — OpenAI-compatible" },
      { value: "anthropic", label: "anthropic — Messages API" },
      { value: "gemini", label: "gemini — AI Studio native" },
      { value: "vertex", label: "vertex — Vertex AI native" },
    ],
  },
];
const ENDPOINT: FieldSpec[] = [
  {
    name: "base_url",
    label: "Base URL",
    wide: true,
    placeholder: "https://api.openai.com/v1",
    hint: "for VERTEX this may be left blank; it is derived from the location",
  },
  { name: "api_version", label: "API version", hint: "Azure OpenAI only (deployment in the path)" },
  { name: "request_timeout_ms", label: "Request timeout", type: "number", suffix: "ms" },
  { name: "stream_idle_timeout_ms", label: "Stream idle timeout", type: "number", suffix: "ms" },
];
const VERTEX: FieldSpec[] = [
  { name: "project", label: "GCP project", placeholder: "my-project", hint: "Vertex only" },
  { name: "location", label: "Location", placeholder: "us-central1", hint: "Vertex only" },
];
const CREDENTIAL: FieldSpec[] = [
  {
    name: "api_key",
    label: "Credential",
    type: "password",
    wide: true,
    hint: "blank keeps the stored one; VERTEX takes the service-account JSON",
  },
];
const FIELDS: FieldSpec[] = [...IDENTITY, ...ENDPOINT, ...VERTEX, ...CREDENTIAL];

export function ProvidersPage() {
  const providers = useAsync(() => api<ProviderRow[]>("/admin/providers"), []);
  const form = useForm({ type: "openai" });
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ProviderRow | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function reload() {
    await providers.reload();
  }

  const type = form.values.type ?? "openai";
  const vertex = type === "vertex";
  const ready =
    Boolean(form.values.slug?.trim()) &&
    (vertex
      ? Boolean(form.values.project?.trim() && form.values.location?.trim())
      : Boolean(form.values.base_url?.trim()));

  async function create() {
    form.setBusy(true);
    form.setError(null);
    try {
      await send("POST", "/admin/providers", toPayload(FIELDS, form.values));
      form.reset({ type: "openai" });
      setCreating(false);
      setNote("Provider created.");
      await reload();
    } catch (e) {
      form.setError(e);
    } finally {
      form.setBusy(false);
    }
  }

  async function update() {
    if (!editing) return;
    form.setBusy(true);
    form.setError(null);
    try {
      await send("PATCH", `/admin/providers/${editing.id}`, toPayload(FIELDS, form.values));
      setEditing(null);
      form.reset({ type: "openai" });
      setNote("Provider updated.");
      await reload();
    } catch (e) {
      form.setError(e);
    } finally {
      form.setBusy(false);
    }
  }

  async function probe(row: ProviderRow) {
    setNote(`Probing ${row.slug}…`);
    try {
      const result = await send<{ ok: boolean; status: number; latency_ms: number }>(
        "POST",
        `/admin/providers/${row.id}/probe`,
      );
      setNote(
        `${row.slug}: ${result.ok ? "ok" : "failed"} (HTTP ${result.status}, ${result.latency_ms}ms)`,
      );
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Probe failed");
    }
  }

  async function remove(row: ProviderRow) {
    if (!window.confirm(`Delete provider "${row.slug}"? Routes pointing at it stop working.`)) return;
    try {
      await send("DELETE", `/admin/providers/${row.id}`);
      setNote(`Deleted ${row.slug}.`);
      await reload();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Delete failed");
    }
  }

  function startEdit(row: ProviderRow) {
    form.reset({
      slug: row.slug,
      type: row.type.toLowerCase(),
      base_url: row.base_url,
      api_version: row.api_version ?? "",
      project: row.project ?? "",
      location: row.location ?? "",
    });
    setEditing(row);
  }

  function providerSections() {
    return (
      <>
        <DialogSection label="Identity">
          <Fields spec={IDENTITY} form={form} />
        </DialogSection>
        <DialogSection label="Endpoint" note="VERTEX may derive it from the location">
          <Fields spec={ENDPOINT} form={form} columns={3} />
        </DialogSection>
        {vertex ? (
          <DialogSection label="Vertex" note="required for this wire format">
            <Fields spec={VERTEX} form={form} />
          </DialogSection>
        ) : null}
        <DialogSection label="Credential" note="encrypted at rest">
          <Fields spec={CREDENTIAL} form={form} />
        </DialogSection>
      </>
    );
  }

  const summary = ready
    ? `${form.values.slug?.trim()} · ${type} → ${
        vertex
          ? `${form.values.location?.trim()} / ${form.values.project?.trim()}`
          : form.values.base_url?.trim()
      }`
    : "A slug and an endpoint are required.";

  function footer(busyLabel: string, label: string) {
    return (
      <>
        <DialogSummary dim={!ready}>{summary}</DialogSummary>
        {form.error ? <ErrorNote error={form.error} /> : null}
        <DialogActions>
          <button
            type="button"
            className="dlg-secondary"
            onClick={() => {
              setCreating(false);
              setEditing(null);
            }}
          >
            Cancel
          </button>
          <button type="submit" className="dlg-primary" disabled={!ready || form.busy}>
            {form.busy ? busyLabel : label}
          </button>
        </DialogActions>
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <h1>Providers</h1>
        <button className="primary" onClick={() => { form.reset({ type: "openai" }); setCreating(true); }}>
          New provider
        </button>
      </div>
      {note ? <p className="note">{note}</p> : null}
      <Panel title="Upstreams" hint="circuit state is per JVM">
        {providers.loading ? (
          <Loading />
        ) : providers.error ? (
          <ErrorNote error={providers.error} />
        ) : (providers.data ?? []).length === 0 ? (
          <Empty>No providers yet.</Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Slug</th>
                <th>Type</th>
                <th>Base URL</th>
                <th>Version</th>
                <th>Credential</th>
                <th>Circuit</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(providers.data ?? []).map((p) => (
                <tr key={p.id}>
                  <td>{p.slug}</td>
                  <td className="muted">{p.type}</td>
                  <td className="muted mono">{p.base_url}</td>
                  <td className="muted">{p.api_version ?? "—"}</td>
                  <td className="muted mono">{p.credential_hint ?? "—"}</td>
                  <td>
                    <Badge tone={p.circuit_state === "open" ? "bad" : p.circuit_state === "half_open" ? "warn" : "good"}>
                      {p.circuit_state}
                    </Badge>
                  </td>
                  <td className="actions">
                    <button className="ghost" onClick={() => startEdit(p)}>Edit</button>
                    <button className="ghost" onClick={() => probe(p)}>Probe</button>
                    <button className="danger" onClick={() => remove(p)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      {creating ? (
        <Dialog
          title="New provider"
          lede="A provider is one upstream endpoint. Add routes after creating it so clients can reach its models."
          onClose={() => setCreating(false)}
          onSubmit={(event) => {
            event.preventDefault();
            create();
          }}
          footer={footer("Creating…", "Create provider")}
        >
          {providerSections()}
        </Dialog>
      ) : null}

      {editing ? (
        <Dialog
          title={`Edit ${editing.slug}`}
          lede="Credentials are write-only; leaving the field blank keeps the stored one."
          onClose={() => setEditing(null)}
          onSubmit={(event) => {
            event.preventDefault();
            update();
          }}
          footer={footer("Saving…", "Save changes")}
        >
          {providerSections()}
        </Dialog>
      ) : null}
    </>
  );
}
