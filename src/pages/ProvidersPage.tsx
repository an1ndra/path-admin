import { api } from "../api";
import { useAsync } from "../useAsync";
import { Badge, Empty, Loading, Panel } from "../components/ui";
import type { ProviderRow } from "../types";

export function ProvidersPage() {
  const providers = useAsync(() => api<ProviderRow[]>("/admin/providers"), []);

  return (
    <>
      <h1>Providers</h1>
      <Panel title="Upstreams" hint="circuit state is per JVM">
        {providers.loading ? (
          <Loading />
        ) : providers.error ? (
          <p className="error">{providers.error}</p>
        ) : (providers.data ?? []).length === 0 ? (
          <Empty>No providers configured.</Empty>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Slug</th>
                <th>Type</th>
                <th>Base URL</th>
                <th>Version</th>
                <th>Credential</th>
                <th>Circuit</th>
              </tr>
            </thead>
            <tbody>
              {(providers.data ?? []).map((p) => (
                <tr key={p.id}>
                  <td>{p.slug}</td>
                  <td className="muted">{p.type}</td>
                  <td className="muted mono">{p.base_url}</td>
                  <td className="muted">{p.api_version ?? "—"}</td>
                  <td className="muted mono">{p.credential_hint ?? "—"}</td>
                  <td>
                    <Badge tone={p.circuit_state === "open" ? "bad" : p.circuit_state === "half_open" ? "warn" : "good"}>
                      {p.circuit_state}
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
