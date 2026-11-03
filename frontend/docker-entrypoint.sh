#!/bin/sh
set -eu
# Renders the nginx config from environment (Railway assigns PORT dynamically
# and exposes the backend through its private DNS name) and starts nginx.
# Defaults keep docker-compose working unchanged (listen 80, backend:3001).
: "${PORT:=80}"
: "${BACKEND_HOST:=backend}"
: "${BACKEND_PORT:=3001}"
export PORT BACKEND_HOST BACKEND_PORT
envsubst '${PORT} ${BACKEND_HOST} ${BACKEND_PORT}' \
  < /etc/nginx/templates/default.conf.template \
  > /etc/nginx/conf.d/default.conf
exec nginx -g 'daemon off;'
