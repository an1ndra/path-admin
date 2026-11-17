import { useState } from "react";
import { api, send } from "../api";
import { useAsync } from "../useAsync";
import { Badge, Empty, Loading, Panel } from "../components/ui";
import { Fields, Modal, toPayload, useForm, type FieldSpec } from "../components/form";
import type { ProviderRow } from "../types";

const FIELDS: FieldSpec[] = [
  { name: "slug", label: "Slug", required: true, placeholder: "openai" },
  {
    name: "type",
    label: "Type",
    type: "select",
    options: [
      { value: "openai", label: "openai (OpenAI wire format)" },
      { value: "anthropic", label: "anthropic (Messages API)" },
    ],
  },
  { name: "base_url", label: "Base URL", required: true, wide: true, placeholder: "https://api.openai.com/v1" },
  { name: "api_key", label: "API key", type: "password", hint: "encrypted at rest; leave blank to keep the stored one" },
  { name: "api_version", label: "api_version", hint: "set for Azure OpenAI (deployment in the path)" },
  { name: "request_timeout_ms", label: "Request timeout (ms)", type: "number" },
  { name: "stream_idle_timeout_ms", label: "Stream idle timeout (ms)", type: "number" },
];

export function ProvidersPage() {
  const providers = useAsync(() => api<ProviderRow[]>("/admin/providers"), []);
  const form = useForm({ type: "openai" });
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ProviderRow | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function reload() {
    await providers.reload();
  }

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
      form.setError(e instanceof Error ? e.message : "Failed");
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
      form.setError(e instanceof Error ? e.message : "Failed");
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
    });
    setEditing(row);
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
          <p className="error">{providers.error}</p>
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
        <Modal title="New provider" onClose={() => setCreating(false)}>
          <Fields spec={FIELDS} form={form} />
          {form.error ? <p className="error">{form.error}</p> : null}
          <div className="modal-actions">
            <button className="ghost" onClick={() => setCreating(false)}>Cancel</button>
            <button className="primary" disabled={form.busy} onClick={create}>
              {form.busy ? "Creating…" : "Create provider"}
            </button>
          </div>
        </Modal>
      ) : null}

      {editing ? (
        <Modal title={`Edit ${editing.slug}`} onClose={() => setEditing(null)}>
          <Fields spec={FIELDS} form={form} />
          {form.error ? <p className="error">{form.error}</p> : null}
          <div className="modal-actions">
            <button className="ghost" onClick={() => setEditing(null)}>Cancel</button>
            <button className="primary" disabled={form.busy} onClick={update}>
              {form.busy ? "Saving…" : "Save changes"}
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
