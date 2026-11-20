import { useState } from "react";
import { api, send } from "../api";
import { useAsync } from "../useAsync";
import { ms, usd } from "../format";
import { Badge, Empty, Loading, Panel } from "../components/ui";
import { ErrorNote } from "../components/ErrorNote";
import { Fields, Modal, toPayload, useForm, type FieldSpec } from "../components/form";
import type { ProviderRow, RouteRow } from "../types";

export function RoutesPage() {
  const routes = useAsync(() => api<RouteRow[]>("/admin/routes"), []);
  const providers = useAsync(() => api<ProviderRow[]>("/admin/providers"), []);
  const form = useForm({ strategy: "priority", type: "openai" });
  const [creating, setCreating] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const basics: FieldSpec[] = [
    {
      name: "public_model_id",
      label: "Public model id",
      required: true,
      placeholder: "gpt-4o-mini",
      hint: "what clients send in \"model\"; an alias works too",
    },
    {
      name: "provider_id",
      label: "Provider",
      type: "select",
      required: true,
      placeholder: "Select a provider…",
      options: (providers.data ?? []).map((p) => ({
        value: String(p.id),
        label: `${p.slug} · ${p.type.toLowerCase()}`,
      })),
    },
    {
      name: "upstream_model_id",
      label: "Upstream model / deployment",
      required: true,
      placeholder: "gpt-4o-mini",
      hint: "the id the provider itself expects",
    },
  ];
  const pricing: FieldSpec[] = [
    { name: "input_price_per_million", label: "Input", type: "number", suffix: "$/M" },
    { name: "output_price_per_million", label: "Output", type: "number", suffix: "$/M" },
    { name: "cached_input_price_per_million", label: "Cached input", type: "number", suffix: "$/M" },
  ];
  const routing: FieldSpec[] = [
    { name: "priority", label: "Priority", type: "number", hint: "lower is tried first", placeholder: "100" },
    {
      name: "strategy",
      label: "Strategy",
      type: "select",
      options: [
        { value: "priority", label: "priority — declared order" },
        { value: "fastest", label: "fastest — lowest EWMA latency" },
        { value: "cheapest-viable", label: "cheapest-viable — under the SLO" },
      ],
    },
    { name: "latency_slo_ms", label: "Latency SLO", type: "number", suffix: "ms", hint: "cheapest-viable only" },
    { name: "context_length", label: "Context length", type: "number", suffix: "tokens" },
  ];
  const caching: FieldSpec[] = [
    { name: "cache_enabled", label: "Exact-match cache", type: "checkbox", hint: "temperature 0, tool-free requests only" },
    { name: "semantic_cache_enabled", label: "Semantic cache", type: "checkbox", hint: "needs a semantic embedding model" },
    { name: "semantic_threshold", label: "Semantic threshold", type: "number", hint: "0.5–1.0, default 0.95" },
  ];
  const fields: FieldSpec[] = [...basics, ...pricing, ...routing, ...caching];
  const ready =
    Boolean(form.values.public_model_id?.trim()) &&
    Boolean(form.values.provider_id) &&
    Boolean(form.values.upstream_model_id?.trim());
  const selectedProvider = (providers.data ?? []).find(
    (p) => String(p.id) === form.values.provider_id,
  );
  const summary = ready
    ? `${form.values.public_model_id.trim()} → ${selectedProvider?.slug ?? "provider"} / ${
        form.values.upstream_model_id.trim()
      }${form.values.strategy && form.values.strategy !== "priority" ? ` · ${form.values.strategy}` : ""}`
    : null;

  async function create() {
    form.setBusy(true);
    form.setError(null);
    try {
      const payload = toPayload(fields, form.values);
      payload.provider_id = Number(payload.provider_id ?? 0);
      await send("POST", "/admin/routes", payload);
      setCreating(false);
      form.reset({ strategy: "priority" });
      setNote("Route created.");
      await routes.reload();
    } catch (e) {
      form.setError(e);
    } finally {
      form.setBusy(false);
    }
  }

  async function toggle(row: RouteRow) {
    try {
      await send("PATCH", `/admin/routes/${row.id}`, { enabled: !row.enabled });
      setNote(`${row.public_model_id} on ${row.provider}: ${row.enabled ? "disabled" : "enabled"}.`);
      await routes.reload();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Failed");
    }
  }

  async function remove(row: RouteRow) {
    if (!window.confirm(`Delete route ${row.public_model_id} → ${row.provider}?`)) return;
    try {
      await send("DELETE", `/admin/routes/${row.id}`);
      setNote("Route deleted.");
      await routes.reload();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>Routes</h1>
        <button className="primary" onClick={() => { form.reset({ strategy: "priority" }); setCreating(true); }}>
          Add model
        </button>
      </div>
      {note ? <p className="note">{note}</p> : null}
      <Panel title="Model routing" hint="EWMA is per JVM">
        {routes.loading ? (
          <Loading />
        ) : routes.error ? (
          <ErrorNote error={routes.error} />
        ) : (routes.data ?? []).length === 0 ? (
          <Empty>No routes yet.</Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Public model</th>
                <th>Provider</th>
                <th>Upstream</th>
                <th>Strategy</th>
                <th className="right">EWMA</th>
                <th className="right">Errors</th>
                <th className="right">In $/M</th>
                <th>Cache</th>
                <th>State</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(routes.data ?? []).map((r) => (
                <tr key={r.id}>
                  <td>{r.public_model_id}</td>
                  <td className="muted">{r.provider}</td>
                  <td className="muted">{r.upstream_model_id}</td>
                  <td><Badge tone={r.strategy === "priority" ? "neutral" : "info"}>{r.strategy}</Badge></td>
                  <td className="right">{r.ewma_latency_ms ? ms(r.ewma_latency_ms) : "—"}</td>
                  <td className="right">{r.ewma_error_rate ? `${Math.round(r.ewma_error_rate * 100)}%` : "0%"}</td>
                  <td className="right">{usd(r.input_price_per_million)}</td>
                  <td>
                    {r.cache_enabled ? (
                      <Badge tone={r.semantic_cache_enabled ? "info" : "neutral"}>
                        {r.semantic_cache_enabled ? "semantic" : "exact"}
                      </Badge>
                    ) : (
                      <span className="muted">off</span>
                    )}
                  </td>
                  <td><Badge tone={r.enabled ? "good" : "neutral"}>{r.enabled ? "enabled" : "disabled"}</Badge></td>
                  <td className="actions">
                    <button className="ghost" onClick={() => toggle(r)}>{r.enabled ? "Disable" : "Enable"}</button>
                    <button className="danger" onClick={() => remove(r)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      {creating ? (
        <Modal title="Add model" wide onClose={() => setCreating(false)}>
          <p className="modal-intro">
            A route maps one public model id to one provider. Add a second route with the same
            public id and a higher priority to create a fallback chain.
          </p>

          <h3 className="form-section">Model</h3>
          <Fields spec={basics} form={form} />

          <h3 className="form-section">
            Pricing <span className="muted">optional — leave blank and the route stays unpriced</span>
          </h3>
          <Fields spec={pricing} form={form} />

          <h3 className="form-section">Routing</h3>
          <Fields spec={routing} form={form} />

          <h3 className="form-section">Caching</h3>
          <Fields spec={caching} form={form} />

          {summary ? <p className="form-summary">{summary}</p> : null}
          {form.error ? <ErrorNote error={form.error} /> : null}
          <div className="modal-actions">
            <button className="ghost" onClick={() => setCreating(false)}>Cancel</button>
            <button className="primary" disabled={!ready || form.busy} onClick={create}>
              {form.busy ? "Adding…" : "Add model"}
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
