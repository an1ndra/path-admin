#!/bin/sh
# Writes the runtime config from GATEWAY_URL. Empty means same origin: put this container
# and the gateway behind one hostname (Dokploy/Traefik path routing) and leave it unset.
set -eu

cat > /usr/share/nginx/html/config.js <<CFG
window.__PATH_CONFIG__ = { gatewayUrl: "${GATEWAY_URL:-}" };
CFG

echo "path-admin: gatewayUrl='${GATEWAY_URL:-}' (empty = same origin)"
