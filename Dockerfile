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

FROM base AS production
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/package.json ./
COPY --from=build /app/tsconfig.base.json ./
RUN mkdir -p /app/packages/backend/data

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["sh", "-c", "npm run db:migrate -w @vcc/backend && node packages/backend/dist/index.js"]
