import { useMemo, useState } from "react";
import { api } from "../api";
import { useAsync } from "../useAsync";
import { ms, num, usd, when } from "../format";
import { Badge, Empty, Loading, Panel, Stat } from "../components/ui";
import { Bars, Ranked, type Bar } from "../components/chart";
import { ErrorNote } from "../components/ErrorNote";
import type { ProviderRow, Stats, UsageRow } from "../types";

type Range = { id: string; label: string; window: string; bucketMs: number; dateLabels?: boolean };

const RANGES: Range[] = [
  { id: "24h", label: "24h", window: "24h", bucketMs: 60 * 60 * 1000 },
  { id: "48h", label: "48h", window: "48h", bucketMs: 2 * 60 * 60 * 1000 },
  { id: "3d", label: "3d", window: "3d", bucketMs: 3 * 60 * 60 * 1000 },
  { id: "7d", label: "7d", window: "7d", bucketMs: 6 * 60 * 60 * 1000, dateLabels: true },
  { id: "30d", label: "30d", window: "30d", bucketMs: 24 * 60 * 60 * 1000, dateLabels: true },
];

const RANGE_KEY = "path.admin.range";

export function Dashboard() {
  const [rangeId, setRangeId] = useState<string>(
    () => localStorage.getItem(RANGE_KEY) ?? "24h",
  );
  const range = RANGES.find((r) => r.id === rangeId) ?? RANGES[0];

  function pick(next: Range) {
    localStorage.setItem(RANGE_KEY, next.id);
    setRangeId(next.id);
  }

  const stats = useAsync(
    () => api<Stats>(`/admin/stats?window=${range.window}`),
    [range.window],
  );
  const providers = useAsync(() => api<ProviderRow[]>("/admin/providers"), []);
  const usage = useAsync(
    () => api<{ data: UsageRow[] }>(`/admin/usage?window=${range.window}&limit=1000`),
    [range.window],
  );

  const rows = usage.data?.data ?? [];

  const buckets: Bar[] = useMemo(() => {
    if (rows.length === 0) return [];
    const now = Date.now();
    // 24 buckets per range, so the bars stay readable whether the window is 24h or 30d.
    const slots = 24;
    const size = range.bucketMs;
    const start = now - size * slots;
    const series: Bar[] = [];
    for (let i = 0; i < slots; i++) {
      const from = start + i * size;
      const to = from + size;
      const inBucket = rows.filter((r) => {
        const t = new Date(r.at).getTime();
        return t >= from && t < to;
      });
      const cost = inBucket.reduce((sum, r) => sum + Number(r.cost_usd ?? 0), 0);
      const at = new Date(from);
      series.push({
        label: range.dateLabels
          ? at.toLocaleDateString(undefined, { month: "short", day: "numeric" })
          : at.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
        value: inBucket.length,
        title: `${at.toLocaleString()} · ${inBucket.length} requests · ${usd(cost)}`,
      });
    }
    return series;
  }, [rows, range.bucketMs, range.dateLabels]);

  const byModel: Bar[] = (stats.data?.by_model ?? [])
    .map((m) => ({
      label: m.model,
      value: Number(m.cost_usd),
      title: `${m.model}: ${m.requests} requests · ${num(m.tokens)} tokens · ${usd(m.cost_usd)}`,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const byRequests: Bar[] = (stats.data?.by_model ?? [])
    .map((m) => ({ label: m.model, value: m.requests, title: `${m.model}: ${m.requests} requests` }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  if (stats.loading && !stats.data) return <Loading />;
  if (stats.error) return <ErrorNote error={stats.error} />;

  const s = stats.data!;
  const failures = rows.filter((r) => r.status !== "success");
  const openCircuits = (providers.data ?? []).filter((p) => p.circuit_state === "open");

  return (
    <>
      <div className="page-head">
        <h1>Last {range.label}</h1>
        <div className="range" role="group" aria-label="Time range">
          {RANGES.map((r) => (
            <button
              key={r.id}
              className={r.id === range.id ? "on" : ""}
              onClick={() => pick(r)}
              aria-pressed={r.id === range.id}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="stats">
        <Stat label="Requests" value={num(s.requests)} sub={`${num(s.total_tokens)} tokens`} />
        <Stat label="Spend" value={usd(s.cost_usd)} sub={`over ${range.label}`} />
        <Stat
          label="Cache"
          value={`${Math.round((s.cache?.hit_ratio ?? 0) * 100)}%`}
          sub={`${usd(s.cache?.savings_usd)} saved · ${num(s.cache?.semantic_hits)} semantic`}
        />
        <Stat label="Latency p95" value={ms(s.latency_ms?.p95)} sub={`p50 ${ms(s.latency_ms?.p50)}`} />
        <Stat label="Fallbacks" value={num(s.fallback_requests ?? 0)} sub="served by a backup route" />
      </div>

      <Panel title="Requests over time" hint={`${range.label} · from the newest ${rows.length} calls`}>
        <Bars data={buckets} format={(v) => `${v} req`} />
      </Panel>

      <div className="grid">
        <Panel title="Spend by model" hint="top 8">
          <Ranked data={byModel} format={(v) => usd(v)} />
        </Panel>
        <Panel title="Requests by model" hint="top 8">
          <Ranked data={byRequests} format={(v) => num(v)} />
        </Panel>
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
                  <th className="right">Traffic</th>
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
                    <td className="right">
                      {num(s.by_provider?.[p.slug]?.requests ?? 0)}{" "}
                      <span className="muted">{usd(s.by_provider?.[p.slug]?.cost_usd)}</span>
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

        <Panel title="Recent failures" hint={range.label}>
          {failures.length === 0 ? (
            <Empty>No failed calls in this window.</Empty>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Model</th>
                  <th>Error</th>
                  <th>Request id</th>
                </tr>
              </thead>
              <tbody>
                {failures.slice(0, 10).map((row) => (
                  <tr key={row.id}>
                    <td className="muted">{when(row.at)}</td>
                    <td>{row.model}</td>
                    <td title={row.error_message ?? ""}>
                      <Badge tone="bad">{row.error_code ?? row.status}</Badge>
                    </td>
                    <td className="muted mono">{row.upstream_request_id ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>
    </>
  );
}
