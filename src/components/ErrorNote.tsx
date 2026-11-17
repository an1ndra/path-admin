import { useState } from "react";
import { ApiError } from "../api";

/**
 * Renders a failed call with what an operator needs to act on it: the message, the error
 * code, the gateway's request id (which is the same id in the server logs) and a one-click
 * copy of the whole thing for a bug report.
 */
export function ErrorNote({ error }: { error: unknown }) {
  const [copied, setCopied] = useState(false);
  if (!error) return null;

  const api = error instanceof ApiError ? error : null;
  const message = error instanceof Error ? error.message : String(error);

  async function copy() {
    const text = api ? api.toText() : message;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="error-box">
      <div className="error-line">
        <strong>{message}</strong>
      </div>
      <div className="error-meta">
        {api ? <span className="badge neutral">HTTP {api.status}</span> : null}
        {api?.code ? <span className="badge bad">{api.code}</span> : null}
        {api?.param ? <span className="muted">param: {api.param}</span> : null}
        {api?.requestId ? (
          <span className="muted mono" title="matches the gateway log">
            request {api.requestId}
          </span>
        ) : null}
        <button className="ghost small" onClick={copy}>
          {copied ? "Copied" : "Copy details"}
        </button>
      </div>
    </div>
  );
}
