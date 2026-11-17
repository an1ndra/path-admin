# Deploy the console on Dokploy

One application. The gateway is a separate Dokploy app.

1. **Create → Application**.
2. Repository `an1ndra/path-admin`, branch `main`, build type **Dockerfile** (there is exactly
   one, at the repo root: node build stage → nginx, non-root, `/healthz`).
3. **Port**: 8080. **Health check path**: `/healthz`.
4. **Environment**:

```bash
# Gateway on another hostname:
GATEWAY_URL=https://gw.example.com

# Or empty, when a path prefix on the gateway's hostname serves this container.
GATEWAY_URL=
```

   `GATEWAY_URL` is read at container start and written into `/config.js`; the same image
   works in any environment, and no rebuild is needed to change it.
5. **Domain**: `admin.example.com`, HTTPS on.

## If the console has its own hostname

The gateway must allow the origin, exactly:

```bash
# gateway app, environment
GATEWAY_CORS_ORIGINS=https://admin.example.com
```

The save button in Settings needs `PUT`, which the gateway allows as of 0.2.3. On anything
older the console reports "Failed to fetch" and the browser console shows the preflight
being rejected.

## Same hostname instead (no CORS)

Serve both from one domain with Traefik path routing:

```
Host(`path.example.com`) && PathPrefix(`/admin-ui`)  → console:8080 (strip prefix)
Host(`path.example.com`)                             → gateway:8080
```

Then leave `GATEWAY_URL` empty and drop `GATEWAY_CORS_ORIGINS`.

## Before it is public

Put it behind Cloudflare Access, Authentik or a VPN. The token screen is a single factor;
`GATEWAY_PROXY_AUTH=true` on the gateway plus an authenticating proxy gives SSO, 2FA and
passkeys without any code here (see the gateway's `docs/SSO.md`).

## Checks after deploy

```bash
curl -fsS https://admin.example.com/healthz     # ok
curl -s https://admin.example.com/config.js     # gatewayUrl must point at the gateway
```

Open the console: the footer shows a build stamp, so a stale bundle is obvious.
