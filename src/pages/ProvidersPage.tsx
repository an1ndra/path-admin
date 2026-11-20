import { useState } from "react";
import { api, send } from "../api";
import { useAsync } from "../useAsync";
import { capabilities } from "../capabilities";
import { Badge, Empty, Loading, Panel } from "../components/ui";
import { ErrorNote } from "../components/ErrorNote";
import {
  Fields,
  focusFirstError,
  toPayload,
  useForm,
  type FieldSpec,
} from "../components/form";
import { Dialog, DialogSection } from "../components/Dialog";
import type { ProviderRow } from "../types";

const IDENTITY: FieldSpec[] = [
  {
    name: "slug",
    label: "Slug",
    required: true,
    placeholder: "openai",
    hint: "the name routes and alerts use",
  },
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
    hint: "picks the request/response shape",
  },
];

/** base_url is wide (spans the row); the three timeouts fill one 3-track row. */
const ENDPOINT: FieldSpec[] = [
  {
    name: "base_url",
    label: "Base URL",
    wide: true,
    placeholder: "https://api.openai.com/v1",
    hint: "for vertex this may be left blank; it is derived from the location",
  },
  {
    name: "api_version",
    label: "API version",
    placeholder: "2024-10-21",
    hint: "Azure OpenAI only",
  },
  {
    name: "request_timeout_ms",
    label: "Request timeout",
    type: "number",
    inputMode: "numeric",
    suffix: "ms",
    placeholder: "60000",
  },
  {
    name: "stream_idle_timeout_ms",
    label: "Stream idle timeout",
    type: "number",
    inputMode: "numeric",
    suffix: "ms",
    placeholder: "30000",
  },
];

const VERTEX: FieldSpec[] = [
  {
    name: "project",
    label: "GCP project",
    required: true,
    placeholder: "my-project",
    hint: "billing and quota owner",
  },
  {
    name: "location",
    label: "Location",
    required: true,
    placeholder: "us-central1",
    hint: "also builds the base URL",
  },
];

const CREDENTIAL: FieldSpec[] = [
  {
    name: "api_key",
    label: "API key or service-account JSON",
    type: "password",
    wide: true,
    hint: "stored encrypted at rest",
    autoComplete: "new-password",
  },
];

/** Payload field list; the endpoint/vertex required flags are applied per type. */
const FIELDS: FieldSpec[] = [...IDENTITY, ...ENDPOINT, ...VERTEX, ...CREDENTIAL];

export function ProvidersPage() {
  const providers = useAsync(() => api<ProviderRow[]>("/admin/providers"), []);
  const caps = useAsync(capabilities, []);
  const canWrite = caps.data?.can_write !== false;
  const readOnlyHint = canWrite ? undefined : "This token is read-only";
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

  /**
   * Required state is derived from the current type, so switching away from
   * vertex drops its required markers before a second submit can see them.
   */
  const identitySpec = IDENTITY;
  const endpointSpec: FieldSpec[] = ENDPOINT.map((field) =>
    field.name === "base_url" ? { ...field, required: !vertex } : field,
  );
  const vertexSpec = vertex ? VERTEX : [];
  const credentialSpec: FieldSpec[] = CREDENTIAL.map((field) => ({
    ...field,
    hint: editing ? "blank keeps the stored credential" : field.hint,
    placeholder: editing
      ? "Leave blank to keep the stored credential"
      : vertex
        ? "{ service-account JSON }"
        : "sk-…",
  }));
  const validateSpec: FieldSpec[] = [
    ...identitySpec,
    ...endpointSpec,
    ...vertexSpec,
    ...credentialSpec,
  ];

  async function create() {
    if (!form.validate(validateSpec)) {
      focusFirstError();
      return;
    }
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
    if (!form.validate(validateSpec)) {
      focusFirstError();
      return;
    }
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
        <DialogSection label="Identity" note="how this upstream is referenced">
          <Fields
            spec={identitySpec}
            form={form}
            onChange={(name) => {
              // A new wire format invalidates the previous type's required set.
              if (name === "type") form.clearErrors();
            }}
          />
        </DialogSection>
        <DialogSection
          label="Endpoint"
          note={vertex ? "derived from the location when blank" : undefined}
        >
          <Fields spec={endpointSpec} form={form} columns={3} />
        </DialogSection>
        {vertex ? (
          <DialogSection label="Vertex" note="required for this wire format">
            <Fields spec={vertexSpec} form={form} />
          </DialogSection>
        ) : null}
        <DialogSection
          label="Credential"
          note={editing ? "write-only — blank keeps the stored secret" : "encrypted at rest"}
        >
          <Fields spec={credentialSpec} form={form} />
        </DialogSection>
      </>
    );
  }

  const target = vertex
    ? `${form.values.location?.trim() || "location"} / ${form.values.project?.trim() || "project"}`
    : form.values.base_url?.trim() || "base URL";
  const summary = ready
    ? `${form.values.slug?.trim()} · ${type} → ${target}`
    : vertex
      ? "A slug, location and project are required."
      : "A slug and a base URL are required.";

  function actions(busyLabel: string, label: string) {
    return (
      <>
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
        <button type="submit" className="dlg-primary" disabled={form.busy}>
          {form.busy ? busyLabel : label}
        </button>
      </>
    );
  }

  return (
    <>
      <div className="page-head page-head-titled">
        <div className="page-head-titles">
          <h1>Providers</h1>
          <p className="page-sub">
            Upstream endpoints and the credentials used to reach them. Routes point at a
            provider; the circuit state is per JVM.
          </p>
        </div>
        <button
          type="button"
          className="primary"
          onClick={() => {
            form.reset({ type: "openai" });
            setCreating(true);
          }}
          disabled={!canWrite}
          title={readOnlyHint}
        >
          New provider
        </button>
      </div>
      {!canWrite ? (
        <p className="note" role="note">
          This token is read-only. Creating, editing, probing and deleting providers are disabled.
        </p>
      ) : null}
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
                    <Badge
                      tone={
                        p.circuit_state === "open"
                          ? "bad"
                          : p.circuit_state === "half_open"
                            ? "warn"
                            : "good"
                      }
                    >
                      {p.circuit_state}
                    </Badge>
                  </td>
                  <td className="actions">
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => startEdit(p)}
                      disabled={!canWrite}
                      title={readOnlyHint}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => probe(p)}
                      disabled={!canWrite}
                      title={readOnlyHint}
                    >
                      Probe
                    </button>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => remove(p)}
                      disabled={!canWrite}
                      title={readOnlyHint}
                    >
                      Delete
                    </button>
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
            void create();
          }}
          summary={summary}
          summaryDim={!ready}
          error={form.error}
          actions={actions("Creating…", "Create provider")}
        >
          {providerSections()}
        </Dialog>
      ) : null}

      {editing ? (
        <Dialog
          title={`Edit ${editing.slug}`}
          lede="Credentials are write-only; leaving the credential field blank keeps the stored secret. A blank endpoint field keeps the stored value."
          onClose={() => setEditing(null)}
          onSubmit={(event) => {
            event.preventDefault();
            void update();
          }}
          summary={summary}
          summaryDim={!ready}
          error={form.error}
          actions={actions("Saving…", "Save changes")}
        >
          {providerSections()}
        </Dialog>
      ) : null}
    </>
  );
}
