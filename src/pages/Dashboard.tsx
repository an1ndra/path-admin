import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "../api";
import { useAsync } from "../useAsync";
import { ms, num, usd, when } from "../format";
import { Badge, Empty, Panel, SkeletonTable, Updating } from "../components/ui";
import { Bars, Ranked, Spark, type Bar } from "../components/chart";
import { ErrorNote } from "../components/ErrorNote";
import type { ProviderRow, Stats, UsageRow } from "../types";
import "../styles/dashboard.css";

type Preset = {
  id: string;
  label: string;
  window: string;
  bucketMs: number;
  /** the wall-clock span this preset asks the server for, used to spot a clamped chart */
  spanMs: number;
  dateLabels?: boolean;
};

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
/** The chart is always 24 buckets: enough to show shape, few enough to stay readable. */
const SLOTS = 24;

const PRESETS: Preset[] = [
  { id: "24h", label: "24h", window: "24h", bucketMs: HOUR, spanMs: DAY },
  { id: "48h", label: "48h", window: "48h", bucketMs: 2 * HOUR, spanMs: 2 * DAY },
  { id: "3d", label: "3d", window: "3d", bucketMs: 3 * HOUR, spanMs: 3 * DAY },
  { id: "7d", label: "7d", window: "7d", bucketMs: 6 * HOUR, spanMs: 7 * DAY, dateLabels: true },
  { id: "30d", label: "30d", window: "30d", bucketMs: DAY, spanMs: 30 * DAY, dateLabels: true },
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

const DAY_SHORT = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });
const DAY_LONG = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" });

/** "13 Nov – 20 Nov 2026" instead of the ISO pair. */
function rangeText(from: string, to: string): string {
  if (!from || !to) return "Custom range";
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "Custom range";
  return `${DAY_SHORT.format(start)} – ${DAY_LONG.format(end)}`;
}

/** "6 hours" / "24 days", for the chart's coverage note. */
function durationText(lengthMs: number): string {
  if (lengthMs >= DAY && lengthMs % DAY === 0) {
    const days = lengthMs / DAY;
    return `${days} ${days === 1 ? "day" : "days"}`;
  }
  if (lengthMs >= HOUR && lengthMs % HOUR === 0) {
    const hours = lengthMs / HOUR;
    return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  }
  const minutes = Math.max(1, Math.round(lengthMs / 60_000));
  return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}

/**
 * One KPI. Label first, value large, a grounded secondary line underneath: the order an
 * operator scans when something has gone wrong. `meter` and `spark` only appear when the
 * API returned the data behind them.
 */
function Kpi({
  label,
  value,
  hint,
  hintTone,
  foot,
  meter,
  spark,
  warn,
}: {
  label: string;
  value: string;
  hint?: string;
  hintTone?: "good" | "warn";
  foot?: ReactNode;
  meter?: { ratio: number; label: string };
  spark?: number[];
  warn?: boolean;
}) {
  const ratio = meter ? Math.min(100, Math.max(0, meter.ratio * 100)) : 0;
  return (
    <div className={warn ? "dashboard-kpi is-warn" : "dashboard-kpi"}>
      <div className="dashboard-kpi-head">
        <span className="dashboard-kpi-label">
          {label}
          {warn ? <span className="page-sr"> — needs attention</span> : null}
        </span>
        {hint ? (
          <span
            className={`dashboard-kpi-hint${hintTone ? ` is-${hintTone}` : ""}`}
            title={hint}
          >
            {hint}
          </span>
        ) : null}
      </div>
      <span className="dashboard-kpi-value" title={value}>
        {value}
      </span>
      {spark && spark.length > 0 ? <Spark values={spark} /> : null}
      {meter ? (
        <span className="dashboard-meter" role="img" aria-label={meter.label}>
          <span className="dashboard-meter-fill" style={{ width: `${ratio}%` }} />
        </span>
      ) : null}
      {foot ? <div className="dashboard-kpi-foot">{foot}</div> : null}
    </div>
  );
}

/** The first paint: placeholders at the same rhythm as the real cards, never a row of zeros. */
function DashboardSkeleton() {
  return (
    <div className="dashboard-skeleton" aria-busy="true" aria-live="polite">
      <p className="dashboard-sr-only">Loading dashboard…</p>
      <div className="dashboard-sk-head" aria-hidden="true">
        <span className="dashboard-sk dashboard-sk-title" />
        <span className="dashboard-sk dashboard-sk-pill" />
      </div>
      <div className="dashboard-kpis" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <div className="dashboard-kpi" key={i}>
            <span className="dashboard-sk dashboard-sk-label" />
            <span className="dashboard-sk dashboard-sk-value" />
            <span className="dashboard-sk dashboard-sk-line" />
            <span className="dashboard-sk dashboard-sk-foot" />
          </div>
        ))}
      </div>
      <div className="dashboard-sk-panel" aria-hidden="true" />
      <div className="dashboard-sk-grid" aria-hidden="true">
        <div className="dashboard-sk-panel is-short" />
        <div className="dashboard-sk-panel is-short" />
      </div>
    </div>
  );
}

export function Dashboard() {
  const [rangeId, setRangeId] = useState<string>(
    () => localStorage.getItem(RANGE_KEY) ?? "24h",
  );
  const [customOpen, setCustomOpen] = useState(false);
  const [from, setFrom] = useState<string>(() => {
    const stored = localStorage.getItem(`${RANGE_KEY}.from`);
    if (stored) return stored;
    const d = new Date(Date.now() - 7 * DAY);
    return isoDay(d);
  });
  const [to, setTo] = useState<string>(() => isoDay(new Date()));
  const customPop = useRef<HTMLDivElement>(null);
  const customButton = useRef<HTMLButtonElement>(null);
  const fromInput = useRef<HTMLInputElement>(null);

  // A popover, not a panel: clicking anywhere else or pressing Escape dismisses it, the
  // same way the console's menus behave.
  useEffect(() => {
    if (!customOpen) return;
    function onPress(event: MouseEvent) {
      const target = event.target as Node;
      if (customPop.current?.contains(target) || customButton.current?.contains(target)) return;
      setCustomOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setCustomOpen(false);
        customButton.current?.focus();
      }
    }
    document.addEventListener("mousedown", onPress);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPress);
      document.removeEventListener("keydown", onKey);
    };
  }, [customOpen]);

  useEffect(() => {
    if (customOpen) fromInput.current?.focus();
  }, [customOpen]);

  const custom = rangeId === "custom";
  const preset = PRESETS.find((r) => r.id === rangeId) ?? PRESETS[0];
  const validRange = Boolean(from && to) && from <= to;
  const span = validRange ? daysBetween(from, to) : 0;
  // Stats and usage take a window, so a custom range asks for everything from its start and
  // narrows to the end date here.
  const window: string = custom ? `${span + 1}d` : preset.window;
  const bucketMs = custom
    ? Math.max(HOUR, Math.round((span * DAY) / 24 / HOUR) * HOUR)
    : preset.bucketMs;
  const dateLabels = custom ? span > 2 : Boolean(preset.dateLabels);
  const label = custom ? rangeText(from, to) : preset.label;
  const shortLabel = custom ? `${span} ${span === 1 ? "day" : "days"}` : preset.label;

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
    customButton.current?.focus();
  }

  const stats = useAsync(() => api<Stats>(`/admin/stats?window=${window}`), [window], `admin:stats:${window}`);
  const providers = useAsync(() => api<ProviderRow[]>("/admin/providers"), [], "admin:providers");
  const usage = useAsync(
    () => api<{ data: UsageRow[] }>(`/admin/usage?window=${window}&limit=1000`),
    [window],
    `admin:usage:${window}`,
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
    const slots = SLOTS;
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
  const sampled = rows.length >= 1000;

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

  if (stats.loading && !stats.data) return <DashboardSkeleton />;
  if (custom && usage.loading && !usage.data) return <DashboardSkeleton />;
  if (stats.error) return <ErrorNote error={stats.error} />;

  const s = view!;
  const failures = rows.filter((r) => r.status !== "success");
  const openCircuits = (providers.data ?? []).filter((p) => p.circuit_state === "open");

  const successRate = rows.length > 0 ? 1 - failures.length / rows.length : null;
  const successText =
    successRate === null
      ? undefined
      : `${(successRate * 100).toFixed(successRate === 1 ? 0 : 1)}% ok`;
  const successTone: "good" | "warn" | undefined =
    successRate === null ? undefined : successRate >= 0.99 ? "good" : successRate < 0.95 ? "warn" : undefined;

  const cacheRatio = Math.min(1, Math.max(0, s.cache?.hit_ratio ?? 0));
  const fallbacks = s.fallback_requests ?? 0;
  const avgCost = s.requests > 0 ? Number(s.cost_usd) / s.requests : null;
  const tokensPerRequest = s.requests > 0 ? s.total_tokens / s.requests : null;
  const fallbackRate = s.requests > 0 ? fallbacks / s.requests : null;

  // The 30d and 7d presets use one bar per day / six hours, which cannot span the whole
  // window in 24 buckets. Say so rather than letting the chart look complete.
  const coverageMs = SLOTS * bucketMs;
  const clamped = !custom && coverageMs < preset.spanMs - 60_000;
  const chartNote = clamped
    ? `Bars are ${durationText(bucketMs)} wide, so the chart covers the most recent ` +
      `${durationText(coverageMs)} of the ${preset.label} window. The KPIs above cover all ${preset.label}.`
    : null;

  const sampleNote = sampled
    ? custom
      ? "Built from the API's 1,000-row page, so these totals are a sample of the range, not an exact count. Narrow the dates for exact figures."
      : "The chart and the failure list use the API's 1,000-row page; the KPIs above come from server aggregates."
    : null;

  return (
    <div className="dashboard">
      <div className="page-head page-head-titled dashboard-head">
        <div className="page-head-titles">
          <h1>Dashboard</h1>
          <p className="page-sub">
            {custom ? label : `Last ${label}`} · requests, spend, cache, latency and
            fallbacks for the window.
          </p>
        </div>
        <div className="range-wrap">
          <div className="range dashboard-range" role="group" aria-label="Time range">
            {PRESETS.map((r) => (
              <button
                key={r.id}
                type="button"
                className={!custom && r.id === rangeId ? "on" : ""}
                onClick={() => pick(r)}
                aria-pressed={!custom && r.id === rangeId}
                title={`Last ${r.label}`}
              >
                {r.label}
              </button>
            ))}
            <button
              ref={customButton}
              type="button"
              className={custom ? "on" : ""}
              onClick={() => setCustomOpen((open) => !open)}
              aria-pressed={custom}
              aria-expanded={customOpen}
              aria-controls="custom-range"
              aria-haspopup="dialog"
              title="Choose a date range"
            >
              Custom
            </button>
          </div>

          {customOpen ? (
            <div
              className="custom-pop dashboard-pop"
              id="custom-range"
              role="group"
              aria-label="Custom date range"
              ref={customPop}
            >
              <label className="range-field">
                <span>From</span>
                <input
                  ref={fromInput}
                  type="date"
                  value={from}
                  max={to || undefined}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </label>
              <label className="range-field">
                <span>To</span>
                <input
                  type="date"
                  value={to}
                  min={from || undefined}
                  max={isoDay(new Date())}
                  onChange={(e) => setTo(e.target.value)}
                />
              </label>
              <div className="range-row">
                <span className="range-span" aria-live="polite">
                  {validRange ? `${span} ${span === 1 ? "day" : "days"}` : "Pick both dates"}
                </span>
                <button type="button" className="primary" onClick={applyCustom} disabled={!validRange}>
                  Apply
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="dashboard-kpis">
        <Kpi
          label="Requests"
          value={num(s.requests)}
          hint={successText}
          hintTone={successTone}
          spark={buckets.map((b) => b.value)}
          foot={
            <>
              <span>{num(s.total_tokens)} tokens</span>
              {tokensPerRequest !== null ? (
                <span>{num(Math.round(tokensPerRequest))} tok / request</span>
              ) : null}
            </>
          }
        />
        <Kpi
          label="Spend"
          value={usd(s.cost_usd)}
          hint={shortLabel}
          foot={
            avgCost !== null ? (
              <span>{usd(avgCost)} avg per request</span>
            ) : (
              <span>No billable requests in this window</span>
            )
          }
        />
        <Kpi
          label="Cache"
          value={`${Math.round(cacheRatio * 100)}%`}
          hint="prompt cache"
          meter={{
            ratio: cacheRatio,
            label: `${Math.round(cacheRatio * 100)}% of prompt tokens served from cache`,
          }}
          foot={
            <>
              <span>{usd(s.cache?.savings_usd)} saved</span>
              <span>{num(s.cache?.exact_hits ?? 0)} exact</span>
              <span>{num(s.cache?.semantic_hits ?? 0)} semantic</span>
              <span>{num(s.cache?.cached_input_tokens)} cached tokens</span>
            </>
          }
        />
        <Kpi
          label="Latency p95"
          value={ms(s.latency_ms?.p95)}
          hint="p95"
          foot={
            <>
              <span>p50 {ms(s.latency_ms?.p50)}</span>
              <span>p99 {ms(s.latency_ms?.p99)}</span>
            </>
          }
        />
        <Kpi
          label="Fallbacks"
          value={num(fallbacks)}
          hint={`of ${num(s.requests)}`}
          warn={fallbacks > 0}
          foot={
            fallbackRate === null ? (
              <span>No calls in this window</span>
            ) : fallbacks === 0 ? (
              <span>Every call used its primary route</span>
            ) : (
              <span>{(fallbackRate * 100).toFixed(1)}% served by a backup route</span>
            )
          }
        />
      </div>

      {sampleNote ? <p className="note dashboard-note">{sampleNote}</p> : null}

      <Panel
        title="Requests over time"
        hint={
          usage.loading && !usage.data
            ? "loading"
            : `${label} · ${num(rows.length)} calls · ${durationText(bucketMs)} per bar`
        }
        actions={usage.loading && usage.data ? <Updating label="Refreshing…" /> : undefined}
      >
        {usage.error ? (
          <ErrorNote error={usage.error} />
        ) : usage.loading && !usage.data ? (
          <SkeletonTable rows={4} columns={6} />
        ) : (
          <Bars
            data={buckets}
            format={(v) => `${num(v)} req`}
            axisFormat={(v) => num(v)}
            label={`Requests over time, ${label}`}
            note={chartNote}
            emptyHint={`No requests recorded in this ${custom ? "range" : `${label} window`} yet.`}
          />
        )}
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
        <Panel
          title="Providers"
          hint={providers.data ? `${providers.data.length} configured` : "circuit state"}
          actions={providers.loading && providers.data ? <Updating label="Refreshing…" /> : undefined}
        >
          {providers.loading && !providers.data ? (
            <SkeletonTable rows={3} columns={3} />
          ) : providers.error ? (
            <ErrorNote error={providers.error} />
          ) : (providers.data ?? []).length === 0 ? (
            <Empty>No providers configured.</Empty>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Circuit</th>
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
                    <td className="right">
                      {num(s.by_provider?.[p.slug]?.requests ?? 0)}
                      <span className="muted"> · {usd(s.by_provider?.[p.slug]?.cost_usd)}</span>
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

        <Panel
          title="Recent failures"
          hint={usage.loading && !usage.data ? "loading" : `${num(failures.length)} in ${label}`}
          actions={usage.loading && usage.data ? <Updating label="Refreshing…" /> : undefined}
        >
          {usage.loading && !usage.data ? (
            <SkeletonTable rows={4} columns={4} />
          ) : failures.length === 0 ? (
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
                    <td className="muted mono">{row.request_id ?? row.upstream_request_id ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>
    </div>
  );
}
