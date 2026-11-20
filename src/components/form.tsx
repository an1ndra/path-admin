import { useState, type ReactNode } from "react";

export type FieldSpec = {
  name: string;
  label: string;
  type?: "text" | "email" | "url" | "number" | "password" | "select" | "checkbox";
  options?: { value: string; label: string }[];
  placeholder?: string;
  hint?: string;
  wide?: boolean;
  required?: boolean;
  /** Rendered inside the input, right-aligned, e.g. "$/M". */
  suffix?: string;
  /** Keyboard hint for numeric/monetary fields; defaults to decimal for numbers. */
  inputMode?: "text" | "numeric" | "decimal" | "email" | "url" | "tel";
  autoComplete?: string;
  /** Overrides "X is required." when the default wording is not specific enough. */
  requiredMessage?: string;
};

export type Values = Record<string, string>;
export type Errors = Record<string, string | undefined>;

/** Small form state holder: strings in, JSON-ready values out. */
export function useForm(initial: Values) {
  const [values, setValues] = useState<Values>(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  /** Typing in a field clears only that field's error, not the rest of the form. */
  function set(name: string, value: string) {
    setValues((current) => ({ ...current, [name]: value }));
    // A server rejection describes the previous payload; editing invalidates it.
    setError(null);
    setErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  }

  function clearErrors(names?: string[]) {
    if (!names) {
      setErrors({});
      return;
    }
    setErrors((current) => {
      const next = { ...current };
      for (const name of names) delete next[name];
      return next;
    });
  }

  /**
   * Checks required fields (and numeric shape), then any page-specific rules.
   * Returns true when the form is clean; the errors are already applied.
   */
  function validate(spec: FieldSpec[], extra?: (values: Values) => Errors): boolean {
    const next: Errors = {};
    for (const field of spec) {
      const raw = (values[field.name] ?? "").trim();
      if (field.required && raw === "") {
        next[field.name] = field.requiredMessage ?? `${field.label} is required.`;
        continue;
      }
      if (field.type === "number" && raw !== "") {
        const n = Number(raw);
        if (!Number.isFinite(n)) next[field.name] = "Enter a number.";
      }
    }
    Object.assign(next, extra?.(values) ?? {});
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  return {
    values,
    errors,
    busy,
    error,
    setError,
    setBusy,
    set,
    setErrors,
    clearErrors,
    validate,
    reset: (next: Values = initial) => {
      setValues(next);
      setErrors({});
      setError(null);
    },
  };
}

export type FormState = ReturnType<typeof useForm>;

/**
 * Focus the first control the last validate() marked invalid. Called from a
 * submit handler, after the new errors have been rendered.
 */
export function focusFirstError(): void {
  requestAnimationFrame(() => {
    const target = document.querySelector<HTMLElement>('.dialog [aria-invalid="true"]');
    target?.focus();
  });
}

/** Drops empty strings; coerces numeric fields; leaves booleans as booleans. */
export function toPayload(spec: FieldSpec[], values: Values): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of spec) {
    const raw = values[field.name];
    if (raw === undefined) continue;
    if (field.type === "checkbox") {
      out[field.name] = raw === "true";
      continue;
    }
    if (raw.trim() === "") continue;
    if (field.type === "number") {
      const n = Number(raw);
      if (!Number.isNaN(n)) out[field.name] = n;
      continue;
    }
    out[field.name] = raw.trim();
  }
  return out;
}

export function Fields({
  spec,
  form,
  columns,
  onChange,
}: {
  spec: FieldSpec[];
  form: FormState;
  /** 2 (default) or 3 equal tracks; pick the one that leaves no orphan cell. */
  columns?: 3;
  /** Fires after a value is written, for pages that reset conditional state. */
  onChange?: (name: string, value: string) => void;
}) {
  function change(field: FieldSpec, value: string) {
    form.set(field.name, value);
    onChange?.(field.name, value);
  }

  return (
    <div className={columns === 3 ? "fields three" : "fields"}>
      {spec.map((field) => {
        const id = `field-${field.name}`;
        const messageId = `${id}-msg`;
        const message = form.errors[field.name] ?? field.hint ?? "";

        if (field.type === "checkbox") {
          return (
            <label key={field.name} className="field check" htmlFor={id}>
              <input
                id={id}
                type="checkbox"
                checked={form.values[field.name] === "true"}
                onChange={(e) => change(field, e.target.checked ? "true" : "false")}
              />
              <span className="check-text">
                <strong>{field.label}</strong>
                {field.hint ? <small>{field.hint}</small> : null}
              </span>
            </label>
          );
        }

        return (
          <div key={field.name} className={field.wide ? "field wide" : "field"}>
            <label htmlFor={id}>
              {field.label}
              {field.required ? <em aria-hidden="true">*</em> : null}
            </label>

            {field.type === "select" ? (
              <select
                id={id}
                value={form.values[field.name] ?? ""}
                aria-invalid={form.errors[field.name] ? true : undefined}
                aria-describedby={messageId}
                onChange={(e) => change(field, e.target.value)}
              >
                {field.placeholder ? <option value="">{field.placeholder}</option> : null}
                {(field.options ?? []).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <span className={field.suffix ? "with-suffix" : undefined}>
                <input
                  id={id}
                  type={field.type === "number" ? "text" : (field.type ?? "text")}
                  inputMode={
                    field.inputMode ??
                    (field.type === "number"
                      ? "decimal"
                      : field.type === "email"
                        ? "email"
                        : undefined)
                  }
                  placeholder={field.placeholder}
                  value={form.values[field.name] ?? ""}
                  aria-invalid={form.errors[field.name] ? true : undefined}
                  aria-describedby={messageId}
                  onChange={(e) => change(field, e.target.value)}
                  autoComplete={field.autoComplete ?? "off"}
                  spellCheck={false}
                />
                {field.suffix ? (
                  <span className="suffix" aria-hidden="true">
                    {field.suffix}
                  </span>
                ) : null}
              </span>
            )}

            <small
              id={messageId}
              className={form.errors[field.name] ? "fld-error" : undefined}
              title={message || undefined}
            >
              {message}
            </small>
          </div>
        );
      })}
    </div>
  );
}

/** Legacy wrapper kept for pages that still mount a small confirmation modal. */
export function Modal({
  title,
  children,
  onClose,
  wide,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={wide ? "modal modal-wide" : "modal"} onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close dialog" title="Close">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path d="M3.7 3.7a1 1 0 0 1 1.4 0L8 6.6l2.9-2.9a1 1 0 1 1 1.4 1.4L9.4 8l2.9 2.9a1 1 0 0 1-1.4 1.4L8 9.4l-2.9 2.9a1 1 0 0 1-1.4-1.4L6.6 8 3.7 5.1a1 1 0 0 1 0-1.4Z" fill="currentColor" />
            </svg>
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
