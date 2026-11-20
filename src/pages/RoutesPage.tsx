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

  return (
    <>
      <div className="page-head">
        <h1>Routes</h1>
        <button className="primary" onClick={() => setCreating(true)}>
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
