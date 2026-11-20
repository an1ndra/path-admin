import { useEffect, useRef, type ReactNode } from "react";

/**
 * The shared dialog shell: 780px, dimmed page, fixed header and footer around a scrollable
 * body, Escape to close, focus trapped inside, first field focused, background locked.
 *
 * Sections are built with {@link DialogSection}; the footer is a summary strip plus
 * {@link DialogActions}.
 */
export function Dialog({
  title,
  lede,
  onClose,
  onSubmit,
  footer,
  children,
}: {
  title: string;
  lede?: string;
  onClose: () => void;
  onSubmit?: (event: React.FormEvent) => void;
  footer: ReactNode;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current
      ?.querySelector<HTMLElement>(".dialog-scroll input, .dialog-scroll select, .dialog-scroll textarea")
      ?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialog.current) return;
      const focusable = Array.from(
        dialog.current.querySelectorAll<HTMLElement>(
          'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute("disabled"));
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
  }, [onClose]);

  const body = (
    <>
      <div className="dialog-scroll">{children}</div>
      <footer className="dlg-foot">{footer}</footer>
    </>
  );

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
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
        {lede ? <p className="dialog-lede">{lede}</p> : null}
        {onSubmit ? (
          <form className="dialog-form" onSubmit={onSubmit} noValidate>
            {body}
          </form>
        ) : (
          <div className="dialog-form">{body}</div>
        )}
      </div>
    </div>
  );
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
        {note ? <span>{note}</span> : null}
      </div>
      {children}
    </section>
  );
}

export function DialogSummary({ dim, children }: { dim: boolean; children: ReactNode }) {
  return (
    <div className="dlg-summary" data-dim={dim} aria-live="polite">
      {children}
    </div>
  );
}

export function DialogActions({ children }: { children: ReactNode }) {
  return <div className="dlg-actions">{children}</div>;
}
