import { api } from "../api";
import { useAsync } from "../useAsync";
import { ms, usd } from "../format";
import { Badge, Empty, Loading, Panel } from "../components/ui";
import type { RouteRow } from "../types";

export function RoutesPage() {
  const routes = useAsync(() => api<RouteRow[]>("/admin/routes"), []);

  return (
    <>
      <h1>Routes</h1>
      <Panel title="Model routing" hint="read-only in this build">
        {routes.loading ? (
          <Loading />
        ) : routes.error ? (
          <p className="error">{routes.error}</p>
        ) : (routes.data ?? []).length === 0 ? (
          <Empty>No routes. Add one through the admin API.</Empty>
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
              </tr>
            </thead>
            <tbody>
              {(routes.data ?? []).map((r) => (
                <tr key={r.id}>
                  <td>{r.public_model_id}</td>
                  <td className="muted">{r.provider}</td>
                  <td className="muted">{r.upstream_model_id}</td>
                  <td>
                    <Badge tone={r.strategy === "priority" ? "neutral" : "info"}>{r.strategy}</Badge>
                  </td>
                  <td className="right">{r.ewma_latency_ms ? ms(r.ewma_latency_ms) : "—"}</td>
                  <td className="right">
                    {r.ewma_error_rate ? `${Math.round(r.ewma_error_rate * 100)}%` : "0%"}
                  </td>
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
                  <td>
                    <Badge tone={r.enabled ? "good" : "neutral"}>
                      {r.enabled ? "enabled" : "disabled"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </>
  );
}
