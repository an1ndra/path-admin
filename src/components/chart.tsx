/**
 * Three tiny dependency-free charts (vertical bars, a sparkline and a ranked list).
 * Everything is CSS boxes and text: no SVG, no chart library, no layout thrash.
 */

export interface Bar {
  label: string;
  value: number;
  /** shown on hover, e.g. "3 requests · $0.0006" */
  title?: string;
}

const NUMBER = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

/** 1, 2 or 5 × a power of ten, so axis ticks read as round numbers. */
function niceStep(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normal = raw / magnitude;
  const mult = normal <= 1 ? 1 : normal <= 2 ? 2 : normal <= 5 ? 5 : 10;
  return mult * magnitude;
}

/**
 * Ticks for a count axis: integers near zero, 3-4 round steps above, always anchored
 * at zero so the bar heights are read against a real baseline.
 */
function axisTicks(max: number): number[] {
  if (max <= 1) return [0, 1];
  if (max <= 4) return Array.from({ length: Math.ceil(max) + 1 }, (_, i) => i);
  const step = niceStep(max / 3);
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
}

/** Five label slots at most: start, quarters, end. */
function xTickIndices(count: number): number[] {
  if (count <= 1) return [0];
  const last = count - 1;
  return [...new Set([0, Math.round(last / 4), Math.round(last / 2), Math.round((last * 3) / 4), last])];
}

export function Bars({
  data,
  height = 148,
  format,
  axisFormat,
  label,
  note,
  emptyHint,
}: {
  data: Bar[];
  height?: number;
  /** formats a value in the footnote, e.g. "12 req" */
  format: (value: number) => string;
  /** formats a y-axis tick; defaults to a plain number */
  axisFormat?: (value: number) => string;
  /** accessible name for the whole plot */
  label?: string;
  /** a caveat rendered under the plot, e.g. "the window is sampled" */
  note?: string | null;
  emptyHint?: string;
}) {
  const tickLabel = axisFormat ?? ((value: number) => NUMBER.format(value));

  if (data.length === 0) {
    return (
      <div className="dash-chart dash-chart-empty">
        <div className="dash-chart-plot" style={{ height }}>
          <div className="dash-chart-area">
            <div className="dash-chart-grid" aria-hidden="true">
              <span className="is-base" style={{ bottom: 0 }} />
            </div>
            <p className="dash-chart-empty-msg">{emptyHint ?? "No traffic in this window."}</p>
          </div>
        </div>
      </div>
    );
  }

  const peak = data.reduce((a, b) => (b.value > a.value ? b : a), data[0]);
  const max = Math.max(...data.map((d) => d.value), 1);
  const ticks = axisTicks(max);
  const top = ticks[ticks.length - 1];
  const indices = xTickIndices(data.length);

  return (
    <div className="dash-chart">
      <div className="dash-chart-plot" style={{ height }}>
        <div className="dash-chart-y" aria-hidden="true">
          {ticks.map((tick) => (
            <span key={tick} style={{ bottom: `${(tick / top) * 100}%` }}>
              {tickLabel(tick)}
            </span>
          ))}
        </div>
        <div className="dash-chart-area">
          <div className="dash-chart-grid" aria-hidden="true">
            {ticks.map((tick) => (
              <span
                key={tick}
                className={tick === 0 ? "is-base" : ""}
                style={{ bottom: `${(tick / top) * 100}%` }}
              />
            ))}
          </div>
          <div
            className="dash-chart-bars"
            role="img"
            aria-label={
              label
                ? `${label}: peak ${format(peak.value)} in ${peak.label}`
                : `Bar chart, peak ${format(peak.value)} in ${peak.label}`
            }
          >
            {data.map((d, i) => {
              // The peak bar gets the accent so the highest bucket is findable without
              // reading every tooltip.
              const isPeak = d.value === peak.value && d.value > 0;
              return (
                <div
                  key={i}
                  className="dash-bar-slot"
                  title={d.title ?? `${d.label}: ${format(d.value)}`}
                >
                  <div
                    className={isPeak ? "dash-bar is-peak" : "dash-bar"}
                    style={{
                      height: d.value > 0 ? `${Math.max(2, (d.value / max) * 100)}%` : 0,
                      minHeight: d.value > 0 ? 3 : 0,
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="dash-chart-x" aria-hidden="true">
        {indices.map((idx) => {
          const position = data.length === 1 ? 50 : ((idx + 0.5) / data.length) * 100;
          const edge = idx === 0 ? " is-first" : idx === data.length - 1 ? " is-last" : "";
          return (
            <span
              key={idx}
              className={`dash-chart-x-label${edge}`}
              style={{ left: `${position}%` }}
            >
              {data[idx].label}
            </span>
          );
        })}
      </div>

      <div className="dash-chart-foot">
        <span>
          <b>Peak</b> {format(peak.value)} at {peak.label}
        </span>
        <span>{data.length} buckets</span>
      </div>

      {note ? <p className="dash-chart-note">{note}</p> : null}
    </div>
  );
}

/** A 24-bar thumbnail of the same series, for a KPI card. */
export function Spark({ values, height = 32 }: { values: number[]; height?: number }) {
  if (values.length === 0) return null;
  const max = Math.max(...values, 1);
  return (
    <div className="dash-spark" style={{ height }} aria-hidden="true">
      {values.map((value, i) => (
        <span
          key={i}
          className={i === values.length - 1 ? "dash-spark-bar is-latest" : "dash-spark-bar"}
          style={{ height: `${value === 0 ? 0 : Math.max(8, (value / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

/** Horizontal bars for a ranked list, e.g. spend per model. */
export function Ranked({
  data,
  format,
}: {
  data: Bar[];
  format: (value: number) => string;
}) {
  if (data.length === 0) return <p className="empty">Nothing to rank yet.</p>;
  // Scale to the largest value, not to 1: spend per model is often sub-dollar,
  // and a floor of 1 made every bar invisible (0.01% width).
  const peak = Math.max(...data.map((d) => d.value));
  const max = peak > 0 ? peak : 1;

  return (
    <div className="dash-rank">
      {data.map((d) => (
        <div className="dash-rank-row" key={d.label} title={d.title}>
          <span className="dash-rank-label">{d.label}</span>
          <span className="dash-rank-track">
            <span className="dash-rank-fill" style={{ width: `${(d.value / max) * 100}%` }} />
          </span>
          <span className="dash-rank-value">{format(d.value)}</span>
        </div>
      ))}
    </div>
  );
}
