import { useEffect, useRef, useState } from "react";
import { send } from "../api";
import type { ProviderRow } from "../types";

interface Props {
  providers: ProviderRow[];
  onClose: () => void;
  onCreated: () => void | Promise<void>;
}

interface Values {
  publicModel: string;
  providerId: string;
  upstream: string;
  inputPrice: string;
  outputPrice: string;
  cachedPrice: string;
  priority: string;
  strategy: string;
  latencySlo: string;
  contextLength: string;
  cacheEnabled: boolean;
  semanticEnabled: boolean;
  semanticThreshold: string;
}

const INITIAL: Values = {
  publicModel: "",
  providerId: "",
  upstream: "",
  inputPrice: "",
  outputPrice: "",
  cachedPrice: "",
  priority: "100",
  strategy: "priority",
  latencySlo: "",
  contextLength: "",
  cacheEnabled: false,
  semanticEnabled: false,
  semanticThreshold: "",
};

/**
 * Add a model route. One public id to one upstream deployment; a second route with the
 * same public id and a higher priority is how a fallback chain is built.
 */
export function AddModelDialog({ providers, onClose, onCreated }: Props) {
  const [values, setValues] = useState<Values>(INITIAL);
  const [errors, setErrors] = useState<{ publicModel?: boolean; providerId?: boolean; upstream?: boolean }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const dialog = useRef<HTMLDivElement>(null);
  const publicInput = useRef<HTMLInputElement>(null);

  const set = <K extends keyof Values>(key: K, value: Values[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  // Escape closes, Tab stays inside, focus starts on the first field, and the page behind
  // does not scroll.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    publicInput.current?.focus();

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

  const ready = Boolean(values.publicModel.trim() && values.providerId && values.upstream.trim());
  const provider = providers.find((p) => String(p.id) === values.providerId);
  const priority = values.priority.trim() || "100";
  const summary = ready
    ? `${values.publicModel.trim()} → ${provider?.slug ?? "provider"} / ${values.upstream.trim()} · priority ${priority}${
        values.strategy !== "priority" ? ` · ${values.strategy}` : ""
      }`
    : "Fill the public model id, provider and upstream model to add this route.";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const next = {
      publicModel: !values.publicModel.trim(),
      providerId: !values.providerId,
      upstream: !values.upstream.trim(),
    };
    setErrors(next);
    if (next.publicModel || next.providerId || next.upstream) {
      (next.publicModel
        ? publicInput.current
        : (dialog.current?.querySelector<HTMLElement>("#route-provider") ?? null)
      )?.focus();
      return;
    }

    setBusy(true);
    setServerError(null);
    const payload: Record<string, unknown> = {
      public_model_id: values.publicModel.trim(),
      provider_id: Number(values.providerId),
      upstream_model_id: values.upstream.trim(),
      priority: Number(priority),
      strategy: values.strategy,
      cache_enabled: values.cacheEnabled,
      semantic_cache_enabled: values.semanticEnabled,
    };
    const numbers: [keyof Values, string][] = [
      ["inputPrice", "input_price_per_million"],
      ["outputPrice", "output_price_per_million"],
      ["cachedPrice", "cached_input_price_per_million"],
      ["latencySlo", "latency_slo_ms"],
      ["contextLength", "context_length"],
      ["semanticThreshold", "semantic_threshold"],
    ];
    for (const [from, to] of numbers) {
      const raw = String(values[from]).trim();
      if (raw === "") continue;
      const parsed = Number(raw);
      if (!Number.isNaN(parsed)) payload[to] = parsed;
    }
    try {
      await send("POST", "/admin/routes", payload);
      await onCreated();
    } catch (e) {
      setServerError(e instanceof Error ? e.message : "Could not create the route.");
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="dialog-model"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-model-title"
        aria-describedby="add-model-lede"
        ref={dialog}
      >
        <header className="dialog-head">
          <h2 id="add-model-title">Add model</h2>
          <button type="button" className="dialog-close" aria-label="Close dialog" onClick={onClose}>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path
                d="M3.7 3.7a1 1 0 0 1 1.4 0L8 6.6l2.9-2.9a1 1 0 1 1 1.4 1.4L9.4 8l2.9 2.9a1 1 0 0 1-1.4 1.4L8 9.4l-2.9 2.9a1 1 0 0 1-1.4-1.4L6.6 8 3.7 5.1a1 1 0 0 1 0-1.4Z"
                fill="currentColor"
              />
            </svg>
          </button>
        </header>
        <p className="dialog-lede" id="add-model-lede">
          One public model id maps to one upstream deployment. Add a second route with the same
          public id and a higher priority to build a fallback chain.
        </p>

        <form onSubmit={submit} noValidate className="dialog-form">
          <div className="dialog-scroll">
          <section className="dlg-section" aria-labelledby="sec-model">
            <div className="dlg-section-head">
              <h3 id="sec-model">Model</h3>
              <span>required</span>
            </div>
            <div className="dlg-grid three">
              <div className="dlg-field">
                <label htmlFor="route-public">
                  Public model id <em>*</em>
                </label>
                <input
                  id="route-public"
                  ref={publicInput}
                  className="dlg-input"
                  value={values.publicModel}
                  placeholder="gpt-4o-mini"
                  aria-describedby={errors.publicModel ? "route-public-error" : "route-public-hint"}
                  aria-invalid={errors.publicModel || undefined}
                  onChange={(e) => set("publicModel", e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
                {errors.publicModel ? (
                  <small className="dlg-error" id="route-public-error" role="alert">A public model id is required.</small>
                ) : (
                  <small id="route-public-hint">clients send this as “model”</small>
                )}
              </div>

              <div className="dlg-field">
                <label htmlFor="route-provider">
                  Provider <em>*</em>
                </label>
                <select
                  id="route-provider"
                  className="dlg-input"
                  value={values.providerId}
                  aria-describedby={errors.providerId ? "route-provider-error" : "route-provider-hint"}
                  aria-invalid={errors.providerId || undefined}
                  onChange={(e) => set("providerId", e.target.value)}
                >
                  <option value="">Select a provider…</option>
                  {providers.map((p) => (
                    <option key={p.id} value={String(p.id)}>
                      {p.slug} · {p.type.toLowerCase()}
                    </option>
                  ))}
                </select>
                {errors.providerId ? (
                  <small className="dlg-error" id="route-provider-error" role="alert">Choose a provider.</small>
                ) : (
                  <small id="route-provider-hint">the upstream this route sends to</small>
                )}
              </div>

              <div className="dlg-field">
                <label htmlFor="route-upstream">
                  Upstream model <em>*</em>
                </label>
                <input
                  id="route-upstream"
                  className="dlg-input"
                  value={values.upstream}
                  placeholder="gpt-4o-mini"
                  aria-describedby={errors.upstream ? "route-upstream-error" : "route-upstream-hint"}
                  aria-invalid={errors.upstream || undefined}
                  onChange={(e) => set("upstream", e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
                {errors.upstream ? (
                  <small className="dlg-error" id="route-upstream-error" role="alert">An upstream model id is required.</small>
                ) : (
                  <small id="route-upstream-hint">the id the provider expects</small>
                )}
              </div>
            </div>
          </section>

          <section className="dlg-section" aria-labelledby="sec-pricing">
            <div className="dlg-section-head">
              <h3 id="sec-pricing">Pricing</h3>
              <span>optional — blank keeps the route unpriced</span>
            </div>
            <div className="dlg-grid three">
              {(
                [
                  ["inputPrice", "route-input-price", "Input", "route-input-price-hint", "per million input tokens"],
                  ["outputPrice", "route-output-price", "Output", "route-output-price-hint", "per million output tokens"],
                  [
                    "cachedPrice",
                    "route-cached-price",
                    "Cached input",
                    "route-cached-price-hint",
                    "falls back to the input price",
                  ],
                ] as const
              ).map(([key, id, label, hintId, hint]) => (
                <div className="dlg-field" key={key}>
                  <label htmlFor={id}>{label}</label>
                  <span className="dlg-number">
                    <input
                      id={id}
                      className="dlg-input"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={values[key]}
                      aria-describedby={hintId}
                      onChange={(e) => set(key, e.target.value)}
                      autoComplete="off"
                    />
                    <span className="suffix" aria-hidden="true">$/M</span>
                  </span>
                  <small id={hintId}>{hint}</small>
                </div>
              ))}
            </div>
          </section>

          <section className="dlg-section" aria-labelledby="sec-routing">
            <div className="dlg-section-head">
              <h3 id="sec-routing">Routing</h3>
              <span>lower priority is tried first</span>
            </div>
            <div className="dlg-grid two">
              <div className="dlg-field">
                <label htmlFor="route-priority">Priority</label>
                <input
                  id="route-priority"
                  className="dlg-input"
                  inputMode="numeric"
                  value={values.priority}
                  placeholder="100"
                  aria-describedby="route-priority-hint"
                  onChange={(e) => set("priority", e.target.value)}
                  autoComplete="off"
                />
                <small id="route-priority-hint">100 is the default</small>
              </div>

              <div className="dlg-field">
                <label htmlFor="route-strategy">Strategy</label>
                <select
                  id="route-strategy"
                  className="dlg-input"
                  value={values.strategy}
                  aria-describedby="route-strategy-hint"
                  onChange={(e) => set("strategy", e.target.value)}
                >
                  <option value="priority">priority — declared order</option>
                  <option value="fastest">fastest — lowest EWMA latency</option>
                  <option value="cheapest-viable">cheapest-viable — under the SLO</option>
                </select>
                <small id="route-strategy-hint">how fallback order is chosen</small>
              </div>

              <div className="dlg-field">
                <label htmlFor="route-latency">Latency SLO</label>
                <span className="dlg-number">
                  <input
                    id="route-latency"
                    className="dlg-input"
                    inputMode="numeric"
                    placeholder="0"
                    value={values.latencySlo}
                    aria-describedby="route-latency-hint"
                    onChange={(e) => set("latencySlo", e.target.value)}
                    autoComplete="off"
                  />
                  <span className="suffix" aria-hidden="true">ms</span>
                </span>
                <small id="route-latency-hint">cheapest-viable only</small>
              </div>

              <div className="dlg-field">
                <label htmlFor="route-context">Context length</label>
                <span className="dlg-number">
                  <input
                    id="route-context"
                    className="dlg-input"
                    inputMode="numeric"
                    placeholder="0"
                    value={values.contextLength}
                    aria-describedby="route-context-hint"
                    onChange={(e) => set("contextLength", e.target.value)}
                    autoComplete="off"
                  />
                  <span className="suffix" aria-hidden="true">tokens</span>
                </span>
                <small id="route-context-hint">window the model accepts</small>
              </div>
            </div>
          </section>

          <section className="dlg-section" aria-labelledby="sec-caching">
            <div className="dlg-section-head">
              <h3 id="sec-caching">Caching</h3>
              <span>optional — off means every request goes upstream</span>
            </div>
            <div className="dlg-cache">
              <label className="dlg-tile">
                <input
                  type="checkbox"
                  checked={values.cacheEnabled}
                  onChange={(e) => set("cacheEnabled", e.target.checked)}
                />
                <span>
                  <strong>Exact-match cache</strong>
                  <small>temperature 0, tool-free</small>
                </span>
              </label>

              <label className="dlg-tile">
                <input
                  type="checkbox"
                  checked={values.semanticEnabled}
                  onChange={(e) => set("semanticEnabled", e.target.checked)}
                />
                <span>
                  <strong>Semantic cache</strong>
                  <small>needs an embedding model</small>
                </span>
              </label>

              <div className="dlg-field">
                <label htmlFor="route-threshold">Semantic threshold</label>
                <input
                  id="route-threshold"
                  className="dlg-input"
                  inputMode="decimal"
                  placeholder="0.95"
                  value={values.semanticThreshold}
                  aria-describedby="route-threshold-hint"
                  onChange={(e) => set("semanticThreshold", e.target.value)}
                  autoComplete="off"
                />
                <small id="route-threshold-hint">0.5 – 1.0, used by semantic cache</small>
              </div>
            </div>
          </section>
          </div>

          <footer className="dlg-foot">
            {serverError ? <p className="dlg-server-error" role="alert">{serverError}</p> : null}
            <div className="dlg-summary" data-dim={!ready} aria-live="polite">
              {summary}
            </div>
            <div className="dlg-actions">
              <button type="button" className="dlg-secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="dlg-primary" disabled={busy}>
                {busy ? "Adding…" : "Add model"}
              </button>
            </div>
          </footer>
        </form>
      </div>
    </div>
  );
}
