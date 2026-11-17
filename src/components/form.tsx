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
}: {
  spec: FieldSpec[];
  form: FormState;
}) {
  return (
    <div className="fields">
      {spec.map((field) => (
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
              {(field.options ?? []).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : field.type === "checkbox" ? (
            <input
              type="checkbox"
              checked={form.values[field.name] === "true"}
              onChange={(e) => form.set(field.name, e.target.checked ? "true" : "false")}
            />
          ) : (
            <input
              type={field.type === "number" ? "text" : (field.type ?? "text")}
              inputMode={field.type === "number" ? "decimal" : undefined}
              placeholder={field.placeholder}
              value={form.values[field.name] ?? ""}
              onChange={(e) => form.set(field.name, e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          )}
          {field.hint ? <small>{field.hint}</small> : null}
        </label>
      ))}
    </div>
  );
}

export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
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
