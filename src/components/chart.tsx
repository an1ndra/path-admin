/**
 * Two tiny SVG charts. No chart library: the shapes are bars, and a dependency would cost
 * more than the ~80 lines it saves.
 */

export interface Bar {
  label: string;
  value: number;
  /** shown on hover, e.g. "3 requests · $0.0006" */
  title?: string;
}

export function Bars({
  data,
  height = 120,
  format,
}: {
  data: Bar[];
  height?: number;
  format: (value: number) => string;
}) {
  if (data.length === 0) {
    return <p className="empty">No traffic in this window.</p>;
  }
  const max = Math.max(...data.map((d) => d.value), 1);
  const peak = data.reduce((a, b) => (b.value > a.value ? b : a), data[0]);

  return (
    <div className="chart">
      <div className="chart-rows">
        <div className="chart-col">
          {data.map((d, i) => (
            <div key={i} className="bar-slot" title={d.title ?? `${d.label}: ${format(d.value)}`}>
              <div
                className={d.value === peak.value && d.value > 0 ? "bar peak" : "bar"}
                style={{ height: `${Math.max(2, (d.value / max) * height)}px` }}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="chart-axis">
        <span>{data[0].label}</span>
        <span>{data[Math.floor(data.length / 2)]?.label}</span>
        <span>{data[data.length - 1].label}</span>
      </div>
      <div className="chart-foot">
        <span>peak {format(peak.value)}</span>
        <span>{data.length} buckets</span>
      </div>
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
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="ranked">
      {data.map((d) => (
        <div className="ranked-row" key={d.label} title={d.title}>
          <span className="ranked-label">{d.label}</span>
          <span className="ranked-track">
            <span className="ranked-fill" style={{ width: `${(d.value / max) * 100}%` }} />
          </span>
          <span className="ranked-value">{format(d.value)}</span>
        </div>
      ))}
    </div>
  );
}
