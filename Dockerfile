FROM node:24-alpine AS builder
WORKDIR /app


COPY package.json package-lock.json* ./
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/core/package.json ./packages/core/
COPY apps/renderer/package.json ./apps/renderer/
COPY apps/server/package.json ./apps/server/
COPY apps/desktop/package.json ./apps/desktop/
COPY apps/website/package.json ./apps/website/
COPY scripts/postinstall.cjs ./scripts/postinstall.cjs
# Full install (not --workspace-scoped): build:renderer/webserver/migrations invoke
# root-level devDependencies (vite, rimraf, typescript) directly, not just workspace deps.
# SKIP_ELECTRON_REBUILD: the root postinstall rebuilds sqlite3 for Electron, which isn't needed here.
ENV SKIP_ELECTRON_REBUILD=true
RUN npm ci

COPY . .

# VITE_API_URL is no longer required for Docker (nginx proxies /api/* internally).
# It is kept as an optional build arg for non-Docker / custom deployments only.
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build:renderer
RUN npm run build:webserver
RUN npm run build:migrations

FROM node:24-alpine AS runner
WORKDIR /app

# nginx serves the static frontend and proxies /api/* to the backend;
# gettext provides envsubst to template the nginx config at startup.
RUN apk add --no-cache nginx gettext

COPY --from=builder /app/dist-renderer /app/dist-renderer
COPY --from=builder /app/dist-server /app/dist-server
COPY --from=builder /app/dist-migrations /app/dist-migrations
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/packages/contracts/package.json /app/packages/contracts/package.json
COPY --from=builder /app/packages/contracts/dist /app/packages/contracts/dist
COPY --from=builder /app/packages/core/package.json /app/packages/core/package.json
COPY --from=builder /app/packages/core/dist /app/packages/core/dist
COPY --from=builder /app/apps/server/package.json /app/apps/server/package.json
COPY scripts/postinstall.cjs ./scripts/postinstall.cjs

# Install only the server workspace and its runtime dependency graph.
# SKIP_ELECTRON_REBUILD: the root postinstall rebuilds sqlite3 for Electron, which isn't needed here.
ENV SKIP_ELECTRON_REBUILD=true
RUN npm ci --omit=dev --workspace @invoice-builder/server

EXPOSE 3000 3001

COPY scripts/docker-start.sh /app/scripts/docker-start.sh
COPY scripts/nginx.conf.template /app/scripts/nginx.conf.template
RUN sed -i 's/\r$//' /app/scripts/docker-start.sh \
    && chmod +x /app/scripts/docker-start.sh

VOLUME ["/app-data"]

CMD ["/app/scripts/docker-start.sh"]
