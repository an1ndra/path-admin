import { api } from "../api";
import { useAsync } from "../useAsync";
import { usd, when } from "../format";
import { Badge, Empty, Loading, Panel } from "../components/ui";
import type { KeyRow } from "../types";

export function KeysPage() {
  const keys = useAsync(() => api<KeyRow[]>("/admin/keys"), []);

  return (
    <>
      <h1>Keys</h1>
      <Panel title="Client keys" hint="budgets and end-user caps">
        {keys.loading ? (
          <Loading />
        ) : keys.error ? (
          <p className="error">{keys.error}</p>
        ) : (keys.data ?? []).length === 0 ? (
          <Empty>No keys yet.</Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Prefix</th>
                <th className="right">Credit</th>
                <th className="right">Used</th>
                <th className="right">Daily</th>
                <th className="right">End user / day</th>
                <th className="right">RPM</th>
                <th>Last used</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {(keys.data ?? []).map((k) => (
                <tr key={k.id}>
                  <td>{k.name}</td>
                  <td className="muted mono">{k.prefix ?? "—"}</td>
                  <td className="right">{usd(k.credit_limit_usd)}</td>
                  <td className="right">{usd(k.used_usd)}</td>
                  <td className="right">{usd(k.daily_limit_usd)}</td>
                  <td className="right">{usd(k.end_user_daily_limit_usd)}</td>
                  <td className="right">{k.rpm_limit ?? "—"}</td>
                  <td className="muted">{when(k.last_used_at)}</td>
                  <td>
                    <Badge tone={k.enabled ? "good" : "neutral"}>
                      {k.enabled ? "active" : "disabled"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </>
  );
}
