# path-admin

Read-only admin dashboard for [Path](https://github.com/an1ndra/path), the provider-agnostic
LLM gateway. Vite + React + TanStack Router, deployed as a static site to Cloudflare Pages.

Path ships the admin API; this is the window into it. Nothing here is required to run the
gateway.

## Screens

| Screen | Calls |
|---|---|
| Dashboard | `GET /admin/stats?window=24h`, `?window=30d`, `GET /admin/providers`, `GET /admin/usage` |
| Routes | `GET /admin/routes` |
| Keys | `GET /admin/keys` |
| Providers | `GET /admin/providers` |

All read-only in this build. Every write still goes through the admin API directly, so the
audit log stays complete.

## Auth

The admin token is pasted on the login screen and kept in `sessionStorage` **only** — never
a cookie, never a URL, and gone when the tab closes. Every request sends it as
`X-Admin-Token`. A 401 or 403 clears it and returns to the login screen.

The gateway is a different origin, so **`allowCredentials` stays off** on its side and
`GATEWAY_CORS_ORIGINS` must list this site's origin:

```bash
GATEWAY_CORS_ORIGINS=https://path-admin.pages.dev
```

## Develop

```bash
npm install
VITE_GATEWAY_URL=http://127.0.0.1:8080 npm run dev     # against a local gateway
npm run build                                          # dist/
npm run preview
```

`VITE_GATEWAY_URL` is baked in at build time. Leave it empty only if the gateway serves this
site from the same origin (for example behind a Cloudflare Worker that routes `/admin/*` to
the tunnel and everything else to these assets).

## Deploy

```bash
npm run build
npx wrangler pages deploy dist --project-name path-admin
```

Set `VITE_GATEWAY_URL` in the Pages project's build environment, not in a committed file.

Before pointing this at a public gateway, put the Pages site behind **Cloudflare Access**:
the token is the only thing standing between a stranger and your spend, keys and route
table otherwise. See the gateway's `docs/ADMIN-UI.md`.

## What this deliberately is not

- No write actions yet — route/keys edits are audited admin calls and deserve their own
  design.
- No charting library: the numbers that matter are small integers and currency, not
  sparklines.
- No state manager, no component library, ~100 KB gzipped total.
