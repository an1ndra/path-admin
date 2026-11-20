import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useAuth } from "../auth";
import { Login } from "../pages/Login";
import { gatewayOrigin } from "../api";
import type { ReactNode } from "react";
import "../styles/shell.css";

const NAV: { label: string; items: { to: string; label: string }[] }[] = [
  {
    label: "Operate",
    items: [
      { to: "/", label: "Dashboard" },
      { to: "/routes", label: "Routes" },
      { to: "/keys", label: "Client keys" },
    ],
  },
  {
    label: "Configure",
    items: [
      { to: "/providers", label: "Providers" },
      { to: "/configuration", label: "Configuration" },
      { to: "/settings", label: "Settings" },
    ],
  },
];

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
      <a className="shell-skip" href="#main-content">
        Skip to content
      </a>

      <aside className="sidebar shell-sidebar">
        <div className="brand shell-brand">
          <span className="dot" aria-hidden="true" />
          <div className="shell-brand-text">
            <span className="shell-brand-name">Path</span>
            <span className="shell-brand-sub">LLM gateway</span>
          </div>
        </div>

        <nav className="shell-nav" aria-label="Primary">
          {NAV.map((group) => (
            <div className="shell-nav-group" key={group.label}>
              <p className="shell-nav-label">{group.label}</p>
              {group.items.map((item) => {
                const active = path === item.to;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={active ? "nav shell-nav-link active" : "nav shell-nav-link"}
                    aria-current={active ? "page" : undefined}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-foot shell-foot">
          <FootRow label="Gateway" className="shell-foot-gateway">
            <code className="shell-foot-origin" title={gatewayOrigin || "same origin"}>
              {trimOrigin(gatewayOrigin) || "same origin"}
            </code>
          </FootRow>
          <FootRow label="Auth" className="shell-foot-auth">
            <span className="shell-foot-value">
              {mode === "proxy" ? "SSO proxy" : "Admin token"}
            </span>
          </FootRow>
          <FootRow label="Build" className="shell-foot-build">
            <code className="shell-foot-hash" title={`build ${__BUILD_ID__}`}>
              {__BUILD_ID__}
            </code>
          </FootRow>
          {mode === "token" ? (
            <button type="button" className="link shell-signout" onClick={signOut}>
              Sign out
            </button>
          ) : null}
        </div>
      </aside>

      <main className="content" id="main-content" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}

function FootRow({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className ? `shell-foot-row ${className}` : "shell-foot-row"}>
      <span className="shell-foot-label">{label}</span>
      {children}
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
