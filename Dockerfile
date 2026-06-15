# Build the app outside docker to avoid issues with the monorepo and lockfile
FROM oven/bun:1.3.12-alpine AS builder
WORKDIR /build
COPY package.json bun.lock ./
COPY backend/package.json backend/package.json
COPY plugin/package.json plugin/package.json
RUN bun install --frozen-lockfile
COPY . .
WORKDIR /build/backend
RUN bun run build

FROM oven/bun:1.3.12-alpine
WORKDIR /usr/src/app
# Bundled server (includes server/drizzle migrations) + built SPA.
COPY --from=builder /build/backend/.output/server ./server
COPY --from=builder /build/backend/.output/public ./public
RUN chown -R bun:bun /usr/src/app
USER bun
# Default ports for `docker run`; overridden by the k8s ConfigMap in production.
ENV PORT=3000
ENV MANAGEMENT_PORT=3001
ENTRYPOINT [ "bun", "run", "server/index.js" ]
