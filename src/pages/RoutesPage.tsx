import { useState } from "react";
import { api, send } from "../api";
import { useAsync } from "../useAsync";
import { ms, usd } from "../format";
import { Badge, Empty, Loading, Panel } from "../components/ui";
import { ErrorNote } from "../components/ErrorNote";
import { AddModelDialog } from "../components/AddModelDialog";
import type { ProviderRow, RouteRow } from "../types";

export function RoutesPage() {
  const routes = useAsync(() => api<RouteRow[]>("/admin/routes"), []);
  const providers = useAsync(() => api<ProviderRow[]>("/admin/providers"), []);
  const [creating, setCreating] = useState(false);
  const [note, setNote] = useState<string | null>(null);

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

  const rows = routes.data ?? [];
  const loaded = !routes.loading && !routes.error;

  return (
    <>
      <header className="page-head page-head-titled page-head-routes">
        <div className="page-head-titles">
          <h1>Routes</h1>
          <p className="page-sub">
            A route maps a public model name to one upstream provider, with its own price,
            cache and failover strategy. Disable a route to pull it from traffic without deleting it.
          </p>
        </div>
        <button type="button" className="primary" onClick={() => setCreating(true)}>
          Add model
        </button>
      </header>

      {note ? (
        <p className="note page-note" role="status">
          {note}
        </p>
      ) : null}

      <Panel
        title="Model routing"
        hint="EWMA is per JVM"
        actions={
          loaded ? (
            <span className="page-count" aria-live="polite">
              {rows.length} {rows.length === 1 ? "route" : "routes"}
            </span>
          ) : null
        }
      >
        {routes.loading ? (
          <Loading label="Loading routes…" />
        ) : routes.error ? (
          <ErrorNote error={routes.error} />
        ) : rows.length === 0 ? (
          <Empty
            title="No routes yet"
            action={
              <button type="button" className="primary" onClick={() => setCreating(true)}>
                Add your first model
              </button>
            }
          >
            Routes connect the model names your applications call to configured providers.
            Add a model to start serving traffic.
          </Empty>
        ) : (
          <table className="page-table">
            <thead>
              <tr>
                <th scope="col">Public model</th>
                <th scope="col">Provider</th>
                <th scope="col">Upstream</th>
                <th scope="col">Strategy</th>
                <th scope="col" className="page-num">EWMA</th>
                <th scope="col" className="page-num">Errors</th>
                <th scope="col" className="page-num">In $/M</th>
                <th scope="col">Cache</th>
                <th scope="col">State</th>
                <th scope="col" className="page-col-actions">
                  <span className="page-sr">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <th scope="row" className="page-model">
                    {r.public_model_id}
                  </th>
                  <td className="muted page-trunc" title={r.provider}>
                    {r.provider}
                  </td>
                  <td className="muted page-trunc" title={r.upstream_model_id}>
                    {r.upstream_model_id}
                  </td>
                  <td>
                    <Badge tone={r.strategy === "priority" ? "neutral" : "info"}>{r.strategy}</Badge>
                  </td>
                  <td className="page-num">{r.ewma_latency_ms ? ms(r.ewma_latency_ms) : "—"}</td>
                  <td
                    className={
                      (r.ewma_error_rate ?? 0) >= 0.05
                        ? "page-num page-error-high"
                        : (r.ewma_error_rate ?? 0) > 0
                          ? "page-num page-error-some"
                          : "page-num"
                    }
                  >
                    {r.ewma_error_rate ? `${Math.round(r.ewma_error_rate * 100)}%` : "0%"}
                  </td>
                  <td className="page-num">{usd(r.input_price_per_million)}</td>
                  <td>
                    {r.cache_enabled ? (
                      <Badge tone={r.semantic_cache_enabled ? "info" : "neutral"}>
                        {r.semantic_cache_enabled ? "semantic" : "exact"}
                      </Badge>
                    ) : (
                      <span className="muted">off</span>
                    )}
                  </td>
                  <td>
                    <Badge tone={r.enabled ? "good" : "neutral"} dot>
                      {r.enabled ? "enabled" : "disabled"}
                    </Badge>
                  </td>
                  <td className="actions page-col-actions">
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => toggle(r)}
                      aria-label={`${r.enabled ? "Disable" : "Enable"} route ${r.public_model_id}`}
                    >
                      {r.enabled ? "Disable" : "Enable"}
                    </button>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => remove(r)}
                      aria-label={`Delete route ${r.public_model_id}`}
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
        <AddModelDialog
          providers={providers.data ?? []}
          onClose={() => setCreating(false)}
          onCreated={async () => {
            setCreating(false);
            setNote("Model added.");
            await routes.reload();
          }}
        />
      ) : null}
    </>
  );
}
