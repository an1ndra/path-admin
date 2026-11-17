import { api } from "../api";
import { useAsync } from "../useAsync";
import { ms, num, usd, when } from "../format";
import { Badge, Empty, Loading, Panel, Stat } from "../components/ui";
import type { ProviderRow, Stats, UsageRow } from "../types";

export function Dashboard() {
  const day = useAsync(() => api<Stats>("/admin/stats?window=24h"), []);
  const month = useAsync(() => api<Stats>("/admin/stats?window=30d"), []);
  const providers = useAsync(() => api<ProviderRow[]>("/admin/providers"), []);
  const recent = useAsync(
    () => api<{ data: UsageRow[] }>("/admin/usage?window=24h&limit=40"),
    [],
  );

  if (day.loading && !day.data) return <Loading />;
  if (day.error) return <p className="error">{day.error}</p>;

  const stats = day.data!;
  const openCircuits = (providers.data ?? []).filter((p) => p.circuit_state === "open");
  const failures = (recent.data?.data ?? []).filter((r) => r.status !== "success");

  return (
    <>
      <h1>Last 24 hours</h1>
      <div className="stats">
        <Stat label="Requests" value={num(stats.requests)} sub={`${num(stats.total_tokens)} tokens`} />
        <Stat
          label="Spend"
          value={usd(stats.cost_usd)}
          sub={`${usd(month.data?.cost_usd)} in 30d`}
        />
        <Stat
          label="Cache"
          value={`${Math.round((stats.cache?.hit_ratio ?? 0) * 100)}%`}
          sub={`${usd(stats.cache?.savings_usd)} saved · ${num(stats.cache?.semantic_hits)} semantic`}
        />
        <Stat
          label="Latency p95"
          value={ms(stats.latency_ms?.p95)}
          sub={`p50 ${ms(stats.latency_ms?.p50)}`}
        />
      </div>

      <div className="grid">
        <Panel title="Providers" hint="circuit state">
          {providers.loading ? (
            <Loading />
          ) : (providers.data ?? []).length === 0 ? (
            <Empty>No providers configured.</Empty>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Circuit</th>
                  <th>Type</th>
                  <th>Traffic</th>
                </tr>
              </thead>
              <tbody>
                {(providers.data ?? []).map((p) => (
                  <tr key={p.id}>
                    <td>
                      {p.slug}
                      {p.api_version ? <span className="tag">azure</span> : null}
                    </td>
                    <td>
                      <Badge tone={p.circuit_state === "open" ? "bad" : p.circuit_state === "half_open" ? "warn" : "good"}>
                        {p.circuit_state}
                      </Badge>
                      {p.circuit_state === "open" && p.circuit_retry_after_seconds ? (
                        <span className="muted"> {p.circuit_retry_after_seconds}s</span>
                      ) : null}
                    </td>
                    <td className="muted">{p.type}</td>
                    <td>
                      {num(stats.by_provider?.[p.slug]?.requests ?? 0)}{" "}
                      <span className="muted">{usd(stats.by_provider?.[p.slug]?.cost_usd)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {openCircuits.length > 0 ? (
            <p className="warn-line">
              {openCircuits.length} provider(s) parked — fallback is carrying their traffic.
            </p>
          ) : null}
        </Panel>

        <Panel title="Top models" hint="by spend, 24h">
          {(stats.by_model ?? []).length === 0 ? (
            <Empty>No traffic yet.</Empty>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Model</th>
                  <th className="right">Req</th>
                  <th className="right">Spend</th>
                </tr>
              </thead>
              <tbody>
                {[...(stats.by_model ?? [])]
                  .sort((a, b) => Number(b.cost_usd) - Number(a.cost_usd))
                  .slice(0, 8)
                  .map((m) => (
                    <tr key={m.model}>
                      <td>{m.model}</td>
                      <td className="right">{num(m.requests)}</td>
                      <td className="right">{usd(m.cost_usd)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>

      <Panel title="Recent failures" hint="last 24h">
        {recent.loading ? (
          <Loading />
        ) : failures.length === 0 ? (
          <Empty>No failed calls. That is the state you want.</Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Model</th>
                <th>Provider</th>
                <th>Error</th>
                <th className="right">Status</th>
              </tr>
            </thead>
            <tbody>
              {failures.slice(0, 12).map((row) => (
                <tr key={row.id}>
                  <td className="muted">{when(row.at)}</td>
                  <td>{row.model}</td>
                  <td className="muted">{row.provider ?? "—"}</td>
                  <td>{row.error_code ?? "—"}</td>
                  <td className="right">
                    <Badge tone="bad">{row.status}</Badge>
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
