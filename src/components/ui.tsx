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
