import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useAuth } from "../auth";
import { Login } from "../pages/Login";
import { gatewayOrigin } from "../api";
import { useEffect, useRef, useState, type ReactNode } from "react";
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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (menuOpen) wasOpen.current = true;
  }, [menuOpen]);

  // Rotating or resizing past the drawer breakpoint must not leave an open drawer
  // rendered without its media-query styles (and with the page scroll locked).
  useEffect(() => {
    const media = window.matchMedia("(max-width: 820px)");
    const onChange = () => {
      if (!media.matches) setMenuOpen(false);
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  // A route change closes the drawer and moves focus to the new page, so a keyboard
  // user does not land back on <body>.
  useEffect(() => {
    if (!wasOpen.current) return;
    wasOpen.current = false;
    setMenuOpen(false);
    mainRef.current?.focus();
  }, [path]);

  useEffect(() => {
    if (!menuOpen) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const first = menuRef.current?.querySelector<HTMLElement>("a, button");
    first?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setMenuOpen(false);
        toggleRef.current?.focus();
        return;
      }
      if (event.key !== "Tab" || !menuRef.current) return;
      const focusable = Array.from(
        menuRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
      );
      if (focusable.length === 0) return;
      const start = focusable[0];
      const end = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === start) {
        event.preventDefault();
        end.focus();
      } else if (!event.shiftKey && document.activeElement === end) {
        event.preventDefault();
        start.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [menuOpen]);

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

        <button
          ref={toggleRef}
          type="button"
          className="shell-menu-toggle"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          aria-controls="shell-mobile-menu"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? (
            <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false">
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          ) : (
            <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false">
              <path d="M3 5.5h14M3 10h14M3 14.5h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          )}
        </button>

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

      {menuOpen ? (
        <>
          <div
            className="shell-mobile-backdrop"
            aria-hidden="true"
            onMouseDown={() => {
              setMenuOpen(false);
              toggleRef.current?.focus();
            }}
          />
        </>
      ) : null}

      <div
        className="shell-mobile-menu"
        id="shell-mobile-menu"
        ref={menuRef}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        hidden={!menuOpen}
      >
        <div className="shell-mobile-head">
          <span className="shell-brand">
            <span className="dot" aria-hidden="true" />
            <span className="shell-brand-name">Path</span>
          </span>
          <button
            type="button"
            className="shell-mobile-close"
            aria-label="Close menu"
            onClick={() => {
              setMenuOpen(false);
              toggleRef.current?.focus();
            }}
          >
            <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false">
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <nav className="shell-mobile-nav" aria-label="Primary">
          {NAV.map((group) => (
            <div className="shell-mobile-group" key={group.label}>
              <p className="shell-nav-label">{group.label}</p>
              {group.items.map((item) => {
                const active = path === item.to;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={active ? "shell-mobile-link active" : "shell-mobile-link"}
                    aria-current={active ? "page" : undefined}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="shell-mobile-foot">
          <div>
            <span>Gateway</span>
            <code>{trimOrigin(gatewayOrigin) || "same origin"}</code>
          </div>
          <div>
            <span>Auth</span>
            <code>{mode === "proxy" ? "SSO proxy" : "Admin token"}</code>
          </div>
          <div>
            <span>Build</span>
            <code>{__BUILD_ID__}</code>
          </div>
          {mode === "token" ? (
            <button type="button" className="shell-mobile-signout" onClick={signOut}>
              Sign out
            </button>
          ) : null}
        </div>
      </div>

      <main className="content" id="main-content" tabIndex={-1} ref={mainRef}>
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
