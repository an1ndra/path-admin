import { useState, type ReactNode } from "react";

export type FieldSpec = {
  name: string;
  label: string;
  type?: "text" | "number" | "password" | "select" | "checkbox";
  options?: { value: string; label: string }[];
  placeholder?: string;
  hint?: string;
  wide?: boolean;
  required?: boolean;
  /** Rendered inside the input, right-aligned, e.g. "$/M". */
  suffix?: string;
};

export type Values = Record<string, string>;

/** Small form state holder: strings in, JSON-ready values out. */
export function useForm(initial: Values) {
  const [values, setValues] = useState<Values>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  return {
    values,
    busy,
    error,
    setError,
    setBusy,
    set: (name: string, value: string) => setValues((v) => ({ ...v, [name]: value })),
    reset: (next: Values = initial) => {
      setValues(next);
      setError(null);
    },
  };
}

export type FormState = ReturnType<typeof useForm>;

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
}: {
  spec: FieldSpec[];
  form: FormState;
  /** 2 (default) or 3 equal tracks; pick the one that leaves no orphan cell. */
  columns?: 3;
}) {
  return (
    <div className={columns === 3 ? "fields three" : "fields"}>
      {spec.map((field) =>
        field.type === "checkbox" ? (
          <label key={field.name} className="field check">
            <input
              type="checkbox"
              checked={form.values[field.name] === "true"}
              onChange={(e) => form.set(field.name, e.target.checked ? "true" : "false")}
            />
            <span className="check-text">
              <strong>{field.label}</strong>
              {field.hint ? <small>{field.hint}</small> : null}
            </span>
          </label>
        ) : (
          <label key={field.name} className={field.wide ? "field wide" : "field"}>
            <span>
              {field.label}
              {field.required ? <em> *</em> : null}
            </span>
            {field.type === "select" ? (
              <select
                value={form.values[field.name] ?? ""}
                onChange={(e) => form.set(field.name, e.target.value)}
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
                  type={field.type === "number" ? "text" : (field.type ?? "text")}
                  inputMode={field.type === "number" ? "decimal" : undefined}
                  placeholder={field.placeholder}
                  value={form.values[field.name] ?? ""}
                  onChange={(e) => form.set(field.name, e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
                {field.suffix ? <span className="suffix">{field.suffix}</span> : null}
              </span>
            )}
            {field.hint ? <small>{field.hint}</small> : null}
          </label>
        ),
      )}
    </div>
  );
}

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
          <button className="icon-btn" onClick={onClose} aria-label="Close dialog" title="Close">
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
