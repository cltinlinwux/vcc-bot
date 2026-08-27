FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/backend/package.json ./packages/backend/
COPY packages/frontend/package.json ./packages/frontend/
COPY packages/bot/package.json ./packages/bot/
RUN npm install

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/ ./packages/
RUN npm run build -w @vcc/shared
RUN npm run build -w @vcc/backend
RUN npm run build -w @vcc/frontend
RUN npm run build -w @vcc/bot
# Fail the build early if the frontend bundle is missing.
RUN test -f /app/packages/frontend/dist/index.html

FROM base AS production
ENV NODE_ENV=production
ENV FRONTEND_DIST=/app/packages/frontend/dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/package.json ./
COPY --from=build /app/tsconfig.base.json ./
RUN mkdir -p /app/packages/backend/data

EXPOSE 3001
# Use 127.0.0.1 rather than localhost: busybox wget prefers the ::1 (IPv6)
# entry, but the Node server binds 0.0.0.0 (IPv4 only).
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3001}/health/ready" || exit 1

CMD ["sh", "-c", "npm run db:migrate -w @vcc/backend && node packages/backend/dist/index.js"]
