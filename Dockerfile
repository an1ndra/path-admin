# Static admin console: build once, serve with nginx, configure at run time.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
# Runtime config: the same image works against any gateway, so the URL is injected by the
# entrypoint rather than baked in at build time.
ENV GATEWAY_URL=""
COPY deploy/nginx.conf /etc/nginx/nginx.conf
COPY deploy/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY deploy/default.conf /etc/nginx/conf.d/default.conf
COPY deploy/docker-entrypoint.sh /docker-entrypoint.d/40-path-config.sh
COPY --from=build /app/dist /usr/share/nginx/html
RUN chmod +x /docker-entrypoint.d/40-path-config.sh \
 && chown -R nginx:nginx /usr/share/nginx/html /var/cache/nginx /var/run /var/log/nginx
USER nginx
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
