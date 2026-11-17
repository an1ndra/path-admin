import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useAuth } from "../auth";
import { Login } from "../pages/Login";
import { gatewayOrigin } from "../api";

const NAV = [
  { to: "/", label: "Dashboard" },
  { to: "/routes", label: "Routes" },
  { to: "/keys", label: "Keys" },
  { to: "/providers", label: "Providers" },
] as const;

export function Layout() {
  const { token, mode, signOut } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });

  if (mode === "unknown") {
    return <p className="empty">Checking how this console is authenticated…</p>;
  }
  if (mode === "token" && !token) {
    return <Login />;
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="dot" /> Path
        </div>
        <nav>
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={path === item.to ? "nav active" : "nav"}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-foot">
          <code title={gatewayOrigin}>{trimOrigin(gatewayOrigin)}</code>
          {mode === "proxy" ? (
            <span className="muted">signed in via SSO</span>
          ) : (
            <button className="link" onClick={signOut}>
              Sign out
            </button>
          )}
          <code className="build" title="build stamp">build {__BUILD_ID__}</code>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}

function trimOrigin(origin: string): string {
  try {
    return new URL(origin).host;
  } catch {
    return origin;
  }
}
