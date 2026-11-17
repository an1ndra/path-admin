# path-admin

Read-only admin dashboard for [Path](https://github.com/an1ndra/path), the provider-agnostic
LLM gateway. Vite + React + TanStack Router, deployed as a static site to Cloudflare Pages.

Path ships the admin API; this is the window into it. Nothing here is required to run the
gateway.

## Screens

| Screen | Calls |
|---|---|
| Dashboard | `GET /admin/stats?window=<range>`, `GET /admin/providers`, `GET /admin/usage?window=<range>` |
| Routes | `GET /admin/routes` |
| Keys | `GET /admin/keys` |
| Providers | `GET /admin/providers` |

Dashboard: range selector (24h / 48h / 3d / 7d / 30d, remembered per browser), requests
over time, spend and requests by model, provider circuits, recent failures with the error
message and the gateway request id.

Providers, routes and client keys can be created, edited and deleted from the UI; each one
is the audited admin endpoint, so `/admin/audit` stays complete. Errors show the message,
HTTP status, error code and request id, with a copy button for a bug report.

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

## Deploy on Dokploy

Dokploy builds the `Dockerfile` and runs it; the image is 25 MB of nginx plus ~110 KB of
assets.

1. **Create an application** → source: this repository → build: Dockerfile.
2. **Environment** → `GATEWAY_URL=https://gw.example.com` (no trailing slash).
   Leave it **empty** if a reverse proxy serves this UI and the gateway on the same
   hostname — then the browser calls `/admin/**` on its own origin and there is no CORS.
3. **Port** → the container listens on `8080`. Point the domain at it and enable HTTPS.
4. **Healthcheck** → `GET /healthz` returns `200 ok`; the image already declares it.

On the gateway side, one setting decides whether the browser is allowed to call it:

```bash
# The UI's public origin, exactly (no wildcard, no trailing slash)
GATEWAY_CORS_ORIGINS=https://admin.example.com
```

`X-Admin-Token` is a custom header, so the browser sends a preflight; the gateway allows
`*` headers and the admin methods already.

### Same hostname instead (recommended)

Put both behind one hostname and skip CORS entirely:

```
https://path.example.com/          → gateway  :8080
https://path.example.com/admin-ui/ → this UI  :8080
```

Dokploy/Traefik `PathPrefix(/admin-ui)` routes to this container; strip the prefix so the
UI is served from `/`, and leave `GATEWAY_URL` empty. `_redirects` is unnecessary there —
nginx already falls back to `index.html`.

### Before it is reachable from the internet

- Put the UI behind **Cloudflare Access** or a VPN, or restrict the deployment so only your
  network reaches it; the admin token is the only other barrier.
- Use a **read-scoped** admin token for the dashboard and a write-scoped one only when you
  are making changes (`POST /admin/tokens`).
- The token lives in `sessionStorage` in this design, so it is per-tab and dies on close;
  no cookie, no `allowCredentials`, no CSRF surface.
