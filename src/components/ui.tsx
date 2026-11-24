import { useId, type ReactNode } from "react";

/**
 * A titled section. The header carries an optional hint and an actions slot (a count,
 * a filter, a link) so panels stay scannable without inventing one-off headers.
 */
export function Panel({
  title,
  hint,
  actions,
  className,
  children,
}: {
  title: string;
  hint?: string;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section
      className={className ? `panel shell-panel ${className}` : "panel shell-panel"}
      aria-labelledby={id}
    >
      <header>
        <h2 id={id}>{title}</h2>
        {hint || actions ? (
          <div className="shell-panel-meta">
            {hint ? <span className="hint">{hint}</span> : null}
            {actions}
          </div>
        ) : null}
      </header>
      <div className="scroll">{children}</div>
    </section>
  );
}

export function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {sub ? <span className="stat-sub">{sub}</span> : null}
    </div>
  );
}

/**
 * Status pill. `tone` maps to the console's semantic colours; `dot` adds a small state
 * marker for enabled/disabled-style badges. Tone classes from styles.css are kept so
 * existing callers (and any page-level styling) keep rendering.
 */
export function Badge({
  tone = "neutral",
  dot = false,
  title,
  children,
}: {
  tone?: string;
  dot?: boolean;
  title?: string;
  children: ReactNode;
}) {
  return (
    <span className={`badge ${tone} shell-badge`} title={title}>
      {dot ? <span className="shell-badge-dot" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

/**
 * Empty state: a short title, one line of context and an optional call to action.
 * Text-only usage (`<Empty>No routes yet.</Empty>`) still works.
 */
export function Empty({
  title,
  action,
  children,
}: {
  title?: string;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="empty shell-empty">
      {title ? <p className="shell-empty-title">{title}</p> : null}
      {children ? <p className="shell-empty-text">{children}</p> : null}
      {action ? <div className="shell-empty-action">{action}</div> : null}
    </div>
  );
}

/** Announced to assistive tech; the spinner is decorative. */
export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="page-loading" role="status" aria-live="polite">
      <span className="page-spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

/**
 * A single skeleton block. Skeletons keep the page's rhythm while content loads, so the
 * shell never collapses to a spinner and the layout does not jump when data arrives.
 */
export function Skeleton({
  className,
  width,
  height,
}: {
  className?: string;
  width?: string | number;
  height?: string | number;
}) {
  return (
    <span
      className={className ? `skeleton ${className}` : "skeleton"}
      style={{
        width: typeof width === "number" ? `${width}px` : width,
        height: typeof height === "number" ? `${height}px` : height,
      }}
      aria-hidden="true"
    />
  );
}

/** Placeholder rows shaped like a data table, used while a table makes its first request. */
export function SkeletonTable({ rows = 6, columns = 6 }: { rows?: number; columns?: number }) {
  return (
    <div className="skeleton-table" aria-hidden="true">
      <div
        className="skeleton-table-row is-head"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: columns }, (_, i) => (
          <Skeleton key={i} className="skeleton-cell" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, row) => (
        <div
          key={row}
          className="skeleton-table-row"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: columns }, (_, column) => (
            <Skeleton
              key={column}
              className={column === 0 ? "skeleton-cell is-wide" : "skeleton-cell"}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Placeholder rows for definition lists such as session, gateway or guardrail facts. */
export function SkeletonFacts({ rows = 5 }: { rows?: number }) {
  return (
    <div className="skeleton-facts" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div className="skeleton-fact" key={i}>
          <Skeleton className="skeleton-fact-label" />
          <Skeleton className="skeleton-fact-value" />
        </div>
      ))}
    </div>
  );
}

/** A quiet inline indicator for a background refresh that keeps the old data on screen. */
export function Updating({ label = "Updating…" }: { label?: string }) {
  return (
    <span className="page-updating" role="status" aria-live="polite">
      <span className="page-updating-dot" aria-hidden="true" />
      {label}
    </span>
  );
}
