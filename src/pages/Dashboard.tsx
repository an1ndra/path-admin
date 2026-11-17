import { useMemo, useState } from "react";
import { api } from "../api";
import { useAsync } from "../useAsync";
import { ms, num, usd, when } from "../format";
import { Badge, Empty, Loading, Panel, Stat } from "../components/ui";
import { Bars, Ranked, type Bar } from "../components/chart";
import { ErrorNote } from "../components/ErrorNote";
import type { ProviderRow, Stats, UsageRow } from "../types";

type Preset = { id: string; label: string; window: string; bucketMs: number; dateLabels?: boolean };

const DAY = 24 * 60 * 60 * 1000;

const PRESETS: Preset[] = [
  { id: "24h", label: "24h", window: "24h", bucketMs: 60 * 60 * 1000 },
  { id: "48h", label: "48h", window: "48h", bucketMs: 2 * 60 * 60 * 1000 },
  { id: "3d", label: "3d", window: "3d", bucketMs: 3 * 60 * 60 * 1000 },
  { id: "7d", label: "7d", window: "7d", bucketMs: 6 * 60 * 60 * 1000, dateLabels: true },
  { id: "30d", label: "30d", window: "30d", bucketMs: 24 * 60 * 60 * 1000, dateLabels: true },
];

/** yyyy-mm-dd in local time, the format an <input type="date"> speaks. */
function isoDay(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00`).getTime();
  const b = new Date(`${to}T00:00:00`).getTime();
  return Math.max(1, Math.round((b - a) / DAY) + 1);
}

const RANGE_KEY = "path.admin.range";

export function Dashboard() {
  const [rangeId, setRangeId] = useState<string>(
    () => localStorage.getItem(RANGE_KEY) ?? "24h",
  );
  const [customOpen, setCustomOpen] = useState(rangeId === "custom");
  const [from, setFrom] = useState<string>(() => {
    const stored = localStorage.getItem(`${RANGE_KEY}.from`);
    if (stored) return stored;
    const d = new Date(Date.now() - 7 * DAY);
    return isoDay(d);
  });
  const [to, setTo] = useState<string>(() => isoDay(new Date()));

  const custom = rangeId === "custom";
  const preset = PRESETS.find((r) => r.id === rangeId) ?? PRESETS[0];
  const span = daysBetween(from, to);
  // Stats and usage take a window, so a custom range asks for everything from its start and
  // narrows to the end date here.
  const window: string = custom ? `${span + 1}d` : preset.window;
  const bucketMs = custom
    ? Math.max(60 * 60 * 1000, Math.round((span * DAY) / 24 / (60 * 60 * 1000)) * 60 * 60 * 1000)
    : preset.bucketMs;
  const dateLabels = custom ? span > 2 : Boolean(preset.dateLabels);
  const label = custom ? `${from} → ${to}` : preset.label;

  function pick(next: Preset) {
    localStorage.setItem(RANGE_KEY, next.id);
    setRangeId(next.id);
    setCustomOpen(false);
  }

  function applyCustom() {
    localStorage.setItem(RANGE_KEY, "custom");
    localStorage.setItem(`${RANGE_KEY}.from`, from);
    setRangeId("custom");
    setCustomOpen(false);
  }

  const stats = useAsync(() => api<Stats>(`/admin/stats?window=${window}`), [window]);
  const providers = useAsync(() => api<ProviderRow[]>("/admin/providers"), []);
  const usage = useAsync(
    () => api<{ data: UsageRow[] }>(`/admin/usage?window=${window}&limit=1000`),
    [window],
  );

  const all = usage.data?.data ?? [];
  const rows = useMemo(() => {
    if (!custom) return all;
    const start = new Date(`${from}T00:00:00`).getTime();
    const end = new Date(`${to}T00:00:00`).getTime() + DAY;
    return all.filter((r) => {
      const t = new Date(r.at).getTime();
      return t >= start && t < end;
    });
  }, [all, custom, from, to]);

  const buckets: Bar[] = useMemo(() => {
    if (rows.length === 0) return [];
    // 24 buckets per range, so the bars stay readable whether the window is 24h or 30d.
    const slots = 24;
    const size = bucketMs;
    const end = custom ? new Date(`${to}T00:00:00`).getTime() + DAY : Date.now();
    const start = custom ? new Date(`${from}T00:00:00`).getTime() : end - size * slots;
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
        label: dateLabels
          ? at.toLocaleDateString(undefined, { month: "short", day: "numeric" })
          : at.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
        value: inBucket.length,
        title: `${at.toLocaleString()} · ${inBucket.length} requests · ${usd(cost)}`,
      });
    }
    return series;
  }, [rows, bucketMs, dateLabels, custom, from, to]);

  /**
   * A custom range cannot use the server aggregates: /admin/stats takes a window that ends
   * "now", so a range in the past would be wrong. Everything below is computed from the
   * rows inside the chosen days, which the panel labels as a sample.
   */
  const computed: Stats | null = useMemo(() => {
    if (!custom) return null;
    const ok = rows.filter((r) => r.status === "success");
    const prompt = rows.reduce((n, r) => n + Number(r.prompt_tokens ?? 0), 0);
    const cached = rows.reduce((n, r) => n + Number(r.cached_input_tokens ?? 0), 0);
    const latencies = ok.map((r) => Number(r.latency_ms ?? 0)).sort((a, b) => a - b);
    const pct = (p: number) =>
      latencies.length === 0 ? 0 : latencies[Math.min(latencies.length - 1, Math.ceil(p * latencies.length) - 1)];

    const group = (key: (r: UsageRow) => string | null | undefined) => {
      const map = new Map<string, { requests: number; tokens: number; cost: number }>();
      for (const r of rows) {
        const k = key(r);
        if (!k) continue;
        const row = map.get(k) ?? { requests: 0, tokens: 0, cost: 0 };
        row.requests += 1;
        row.tokens += Number(r.total_tokens ?? 0);
        row.cost += Number(r.cost_usd ?? 0);
        map.set(k, row);
      }
      return map;
    };

    const byProvider: Record<string, { requests: number; cost_usd: number }> = {};
    group((r) => r.provider).forEach((v, k) => {
      byProvider[k] = { requests: v.requests, cost_usd: v.cost };
    });

    return {
      requests: rows.length,
      cost_usd: rows.reduce((n, r) => n + Number(r.cost_usd ?? 0), 0),
      total_tokens: rows.reduce((n, r) => n + Number(r.total_tokens ?? 0), 0),
      cache: {
        prompt_tokens: prompt,
        cached_input_tokens: cached,
        hit_ratio: prompt === 0 ? 0 : cached / prompt,
        savings_usd: rows.reduce((n, r) => n + Number(r.cached_savings_usd ?? 0), 0),
      },
      latency_ms: { p50: pct(0.5), p95: pct(0.95), p99: pct(0.99) },
      fallback_requests: rows.filter((r) => (r.attempts ?? 1) > 1).length,
      by_provider: byProvider,
      by_model: [...group((r) => r.model)].map(([model, v]) => ({
        model,
        requests: v.requests,
        tokens: v.tokens,
        cost_usd: v.cost,
      })),
    };
  }, [custom, rows]);

  const view: Stats | null = custom ? computed : stats.data;
  const sampled = custom && rows.length >= 1000;

  const byModel: Bar[] = (view?.by_model ?? [])
    .map((m) => ({
      label: m.model,
      value: Number(m.cost_usd),
      title: `${m.model}: ${m.requests} requests · ${num(m.tokens)} tokens · ${usd(m.cost_usd)}`,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const byRequests: Bar[] = (view?.by_model ?? [])
    .map((m) => ({ label: m.model, value: m.requests, title: `${m.model}: ${m.requests} requests` }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  if (stats.loading && !stats.data) return <Loading />;
  if (stats.error) return <ErrorNote error={stats.error} />;

  const s = view!;
  const failures = rows.filter((r) => r.status !== "success");
  const openCircuits = (providers.data ?? []).filter((p) => p.circuit_state === "open");

  return (
    <>
      <div className="page-head">
        <h1>{custom ? `${from} → ${to}` : `Last ${label}`}</h1>
        <div className="range" role="group" aria-label="Time range">
          {PRESETS.map((r) => (
            <button
              key={r.id}
              className={!custom && r.id === rangeId ? "on" : ""}
              onClick={() => pick(r)}
              aria-pressed={!custom && r.id === rangeId}
            >
              {r.label}
            </button>
          ))}
          <button
            className={custom ? "on" : ""}
            onClick={() => setCustomOpen((open) => !open)}
            aria-pressed={custom}
          >
            Custom
          </button>
        </div>
      </div>

      {customOpen ? (
        <div className="custom-range">
          <label>
            <span>From</span>
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            <span>To</span>
            <input
              type="date"
              value={to}
              min={from}
              max={isoDay(new Date())}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <span className="muted">{span} day{span === 1 ? "" : "s"}</span>
          <button className="primary" onClick={applyCustom}>
            Show range
          </button>
        </div>
      ) : null}

      <div className="stats">
        <Stat label="Requests" value={num(s.requests)} sub={`${num(s.total_tokens)} tokens`} />
        <Stat label="Spend" value={usd(s.cost_usd)} sub={custom ? `${span} days` : `over ${label}`} />
        <Stat
          label="Cache"
          value={`${Math.round((s.cache?.hit_ratio ?? 0) * 100)}%`}
          sub={`${usd(s.cache?.savings_usd)} saved · ${num(s.cache?.semantic_hits)} semantic`}
        />
        <Stat label="Latency p95" value={ms(s.latency_ms?.p95)} sub={`p50 ${ms(s.latency_ms?.p50)}`} />
        <Stat label="Fallbacks" value={num(s.fallback_requests ?? 0)} sub="served by a backup route" />
      </div>

      {sampled ? (
        <p className="note">
          1000 rows is the API's page size: these numbers are a sample of the range, not the
          full total. Narrow the dates for exact figures.
        </p>
      ) : null}
      <Panel title="Requests over time" hint={`${label} · ${rows.length} calls in range`}>
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

        <Panel title="Recent failures" hint={label}>
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
