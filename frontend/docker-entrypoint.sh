#!/bin/sh
set -eu
# Renders the nginx config from environment (Railway assigns PORT dynamically
# and exposes the backend through its private DNS name) and starts nginx.
# Defaults keep docker-compose working unchanged (listen 80, backend:3001).
: "${PORT:=80}"
: "${BACKEND_HOST:=backend}"
: "${BACKEND_PORT:=3001}"
# Nginx needs an explicit resolver IP when proxy_pass uses a variable.
# Railway injects its internal DNS into /etc/resolv.conf, which already
# resolves *.railway.internal; fall back to Docker's embedded DNS, then 1.1.1.1.
if [ -z "${RESOLVER:-}" ]; then
  RESOLVER="$(awk '/^nameserver/{print $2; exit}' /etc/resolv.conf 2>/dev/null || true)"
  if [ -z "$RESOLVER" ]; then
    RESOLVER="127.0.0.11"
  fi
fi
export PORT BACKEND_HOST BACKEND_PORT RESOLVER
envsubst '${PORT} ${BACKEND_HOST} ${BACKEND_PORT} ${RESOLVER}' \
  < /etc/nginx/templates/default.conf.template \
  > /etc/nginx/conf.d/default.conf
nginx -t
exec nginx -g 'daemon off;'
