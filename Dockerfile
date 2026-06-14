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
COPY --from=builder /build/backend/.output/server-entry .
COPY backend/server/drizzle server/drizzle
RUN chown -R bun:bun /usr/src/app
USER bun
ENTRYPOINT [ "/usr/src/app/server-entry" ]
