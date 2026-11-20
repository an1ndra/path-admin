import { useState } from "react";
import { send } from "../api";
import { Dialog, DialogSection } from "./Dialog";
import { focusFirstError } from "./form";
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

type ErrorKey =
  | "publicModel"
  | "providerId"
  | "upstream"
  | "inputPrice"
  | "outputPrice"
  | "cachedPrice"
  | "latencySlo"
  | "contextLength"
  | "semanticThreshold";

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
  semanticEnabled: false,
  cacheEnabled: false,
  semanticThreshold: "",
};

/** Numeric route fields: [form key, payload key, error wording]. */
const NUMBERS: [keyof Values, string][] = [
  ["inputPrice", "input_price_per_million"],
  ["outputPrice", "output_price_per_million"],
  ["cachedPrice", "cached_input_price_per_million"],
  ["latencySlo", "latency_slo_ms"],
  ["contextLength", "context_length"],
  ["semanticThreshold", "semantic_threshold"],
];

/**
 * Add a model route. One public id to one upstream deployment; a second route with the
 * same public id and a higher priority is how a fallback chain is built.
 */
export function AddModelDialog({ providers, onClose, onCreated }: Props) {
  const [values, setValues] = useState<Values>(INITIAL);
  const [errors, setErrors] = useState<Partial<Record<ErrorKey, string>>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof Values>(key: K, value: Values[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setServerError(null);
    setErrors((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key as ErrorKey];
      return next;
    });
  };

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

    const next: Partial<Record<ErrorKey, string>> = {};
    if (!values.publicModel.trim()) next.publicModel = "A public model id is required.";
    if (!values.providerId) next.providerId = "Choose a provider.";
    if (!values.upstream.trim()) next.upstream = "An upstream model id is required.";

    for (const [key] of NUMBERS) {
      const raw = String(values[key]).trim();
      if (raw !== "" && !Number.isFinite(Number(raw))) next[key as ErrorKey] = "Enter a number.";
    }
    if (values.semanticThreshold.trim() !== "") {
      const threshold = Number(values.semanticThreshold);
      if (Number.isFinite(threshold) && (threshold < 0.5 || threshold > 1)) {
        next.semanticThreshold = "Use a value between 0.5 and 1.0.";
      }
    }

    setErrors(next);
    if (Object.keys(next).length > 0) {
      focusFirstError();
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
    for (const [from, to] of NUMBERS) {
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
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      title="Add model"
      lede="One public model id maps to one upstream deployment. Add a second route with the same public id and a higher priority to build a fallback chain."
      onClose={onClose}
      onSubmit={submit}
      summary={summary}
      summaryDim={!ready}
      error={serverError}
      actions={
        <>
          <button type="button" className="dlg-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="dlg-primary" disabled={busy}>
            {busy ? "Adding…" : "Add model"}
          </button>
        </>
      }
    >
      <DialogSection label="Model" note="required">
        <div className="dlg-grid three">
          <div className="dlg-field">
            <label htmlFor="route-public">
              Public model id <em>*</em>
            </label>
            <input
              id="route-public"
              className="dlg-input"
              value={values.publicModel}
              placeholder="gpt-4o-mini"
              aria-describedby={errors.publicModel ? "route-public-error" : "route-public-hint"}
              aria-invalid={errors.publicModel ? true : undefined}
              onChange={(e) => set("publicModel", e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            {errors.publicModel ? (
              <small className="fld-error" id="route-public-error" role="alert">
                {errors.publicModel}
              </small>
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
              aria-invalid={errors.providerId ? true : undefined}
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
              <small className="fld-error" id="route-provider-error" role="alert">
                {errors.providerId}
              </small>
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
              aria-invalid={errors.upstream ? true : undefined}
              onChange={(e) => set("upstream", e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            {errors.upstream ? (
              <small className="fld-error" id="route-upstream-error" role="alert">
                {errors.upstream}
              </small>
            ) : (
              <small id="route-upstream-hint">the id the provider expects</small>
            )}
          </div>
        </div>
      </DialogSection>

      <DialogSection label="Pricing" note="optional — blank keeps the route unpriced">
        <div className="dlg-grid three">
          {(
            [
              ["inputPrice", "route-input-price", "Input", "route-input-price-hint", "per million input tokens"],
              [
                "outputPrice",
                "route-output-price",
                "Output",
                "route-output-price-hint",
                "per million output tokens",
              ],
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
                  aria-invalid={errors[key] ? true : undefined}
                  aria-describedby={errors[key] ? `${id}-error` : hintId}
                  onChange={(e) => set(key, e.target.value)}
                  autoComplete="off"
                />
                <span className="suffix" aria-hidden="true">
                  $/M
                </span>
              </span>
              {errors[key] ? (
                <small className="fld-error" id={`${id}-error`} role="alert">
                  {errors[key]}
                </small>
              ) : (
                <small id={hintId}>{hint}</small>
              )}
            </div>
          ))}
        </div>
      </DialogSection>

      <DialogSection label="Routing" note="lower priority is tried first">
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
                aria-invalid={errors.latencySlo ? true : undefined}
                aria-describedby={errors.latencySlo ? "route-latency-error" : "route-latency-hint"}
                onChange={(e) => set("latencySlo", e.target.value)}
                autoComplete="off"
              />
              <span className="suffix" aria-hidden="true">
                ms
              </span>
            </span>
            {errors.latencySlo ? (
              <small className="fld-error" id="route-latency-error" role="alert">
                {errors.latencySlo}
              </small>
            ) : (
              <small id="route-latency-hint">cheapest-viable only</small>
            )}
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
                aria-invalid={errors.contextLength ? true : undefined}
                aria-describedby={errors.contextLength ? "route-context-error" : "route-context-hint"}
                onChange={(e) => set("contextLength", e.target.value)}
                autoComplete="off"
              />
              <span className="suffix" aria-hidden="true">
                tokens
              </span>
            </span>
            {errors.contextLength ? (
              <small className="fld-error" id="route-context-error" role="alert">
                {errors.contextLength}
              </small>
            ) : (
              <small id="route-context-hint">window the model accepts</small>
            )}
          </div>
        </div>
      </DialogSection>

      <DialogSection label="Caching" note="optional — off means every request goes upstream">
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
              aria-invalid={errors.semanticThreshold ? true : undefined}
              aria-describedby={
                errors.semanticThreshold ? "route-threshold-error" : "route-threshold-hint"
              }
              onChange={(e) => set("semanticThreshold", e.target.value)}
              autoComplete="off"
            />
            {errors.semanticThreshold ? (
              <small className="fld-error" id="route-threshold-error" role="alert">
                {errors.semanticThreshold}
              </small>
            ) : (
              <small id="route-threshold-hint">0.5 – 1.0, used by semantic cache</small>
            )}
          </div>
        </div>
      </DialogSection>
    </Dialog>
  );
}
