import { useEffect, useRef, type ReactNode } from "react";
import { ApiError } from "../api";
import "../styles/forms.css";

/**
 * The shared dialog shell: 780px, dimmed page, fixed header and footer around a
 * scrollable body, Escape to close, focus trapped inside, first field focused,
 * background locked.
 *
 * The footer owns exactly one status row. It shows the live summary, or the
 * server error in the same 34px strip — so a failed save never moves the
 * buttons under the operator's cursor.
 */
export function Dialog({
  title,
  lede,
  onClose,
  onSubmit,
  summary,
  summaryDim = false,
  error,
  actions,
  children,
}: {
  title: string;
  lede?: string;
  onClose: () => void;
  onSubmit?: (event: React.FormEvent) => void;
  /** Live footer summary of what the primary action will do. */
  summary?: ReactNode;
  /** Dims the summary while required input is still missing. */
  summaryDim?: boolean;
  /** Server-side failure, rendered in place of the summary. */
  error?: unknown;
  actions: ReactNode;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);

  function markScrolled() {
    const el = scroller.current;
    const shell = dialog.current;
    if (el && shell) shell.dataset.scrolled = el.scrollTop > 2 ? "true" : "false";
  }
  // Keep the latest handler without re-running the mount effect: re-running it
  // after every keystroke would steal focus back to the first field.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const firstField = dialog.current?.querySelector<HTMLElement>(
      ".dialog-scroll input:not([type=hidden]):not([disabled]), " +
        ".dialog-scroll select:not([disabled]), " +
        ".dialog-scroll textarea:not([disabled])",
    );
    (firstField ?? dialog.current?.querySelector<HTMLElement>(".dialog-close"))?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialog.current) return;
      const focusable = Array.from(
        dialog.current.querySelectorAll<HTMLElement>(
          'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true");
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []);

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && closeRef.current()}
    >
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby={lede ? "dialog-lede" : undefined}
        ref={dialog}
      >
        <header className="dialog-head">
          <h2 id="dialog-title">{title}</h2>
          <button type="button" className="dialog-close" aria-label="Close dialog" onClick={onClose}>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path
                d="M3.7 3.7a1 1 0 0 1 1.4 0L8 6.6l2.9-2.9a1 1 0 1 1 1.4 1.4L9.4 8l2.9 2.9a1 1 0 0 1-1.4 1.4L8 9.4l-2.9 2.9a1 1 0 0 1-1.4-1.4L6.6 8 3.7 5.1a1 1 0 0 1 0-1.4Z"
                fill="currentColor"
              />
            </svg>
          </button>
        </header>
        {lede ? (
          <p className="dialog-lede" id="dialog-lede">
            {lede}
          </p>
        ) : null}

        {onSubmit ? (
          <form className="dialog-form" onSubmit={onSubmit} noValidate>
            {body(children, summary, summaryDim, error, actions, scroller, markScrolled)}
          </form>
        ) : (
          <div className="dialog-form">
            {body(children, summary, summaryDim, error, actions, scroller, markScrolled)}
          </div>
        )}
      </div>
    </div>
  );
}

function body(
  children: ReactNode,
  summary: ReactNode,
  summaryDim: boolean,
  error: unknown,
  actions: ReactNode,
  scroller: React.RefObject<HTMLDivElement | null>,
  onScroll: () => void,
) {
  return (
    <>
      <div className="dialog-scroll" ref={scroller} onScroll={onScroll}>
        {children}
      </div>
      <footer className="dlg-foot">
        <StatusSummary summary={summary} dim={summaryDim} error={error} />
        <div className="dlg-actions">{actions}</div>
      </footer>
    </>
  );
}

/** One 34px row: either the live summary or the server error, never both. */
function StatusSummary({ summary, dim, error }: { summary?: ReactNode; dim: boolean; error: unknown }) {
  if (error) {
    return (
      <div className="dlg-summary is-error" role="alert" title={errorDetail(error)}>
        <span className="dlg-status-flag">Error</span>
        <span className="dlg-status-text">{errorMessage(error)}</span>
      </div>
    );
  }
  return (
    <div className="dlg-summary" data-dim={dim} aria-live="polite">
      <span className="dlg-status-text">{summary}</span>
    </div>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorDetail(error: unknown): string {
  if (error instanceof ApiError) return error.toText();
  return errorMessage(error);
}

export function DialogSection({
  label,
  note,
  children,
}: {
  label: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section className="dlg-section" aria-label={label}>
      <div className="dlg-section-head">
        <h3>{label}</h3>
        {note ? <span title={note}>{note}</span> : null}
      </div>
      {children}
    </section>
  );
}

export function DialogActions({ children }: { children: ReactNode }) {
  return <div className="dlg-actions">{children}</div>;
}
