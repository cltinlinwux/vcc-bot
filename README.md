# VCC — Virtual Card Combat

Online card battle game with Discord bot companion. Production-ready monorepo with real-time PvP, ranked matchmaking, and bot integration.

Want to contribute? See [CONTRIBUTING.md](CONTRIBUTING.md) for dev setup and testing, and [SECURITY.md](SECURITY.md) for reporting vulnerabilities.

## Stack

- **Backend**: Node.js, Express, SQLite, Socket.io, JWT auth
- **Frontend**: React 19, Vite, Tailwind CSS
- **Bot**: Discord.js slash commands
- **Shared**: TypeScript game engine and types

## Quick Start

Requires Node.js 20 (see `.nvmrc`).

```bash
# Install
npm install

# Configure environment (optional for local dev; required for production)
cp .env.example .env

# Setup database
npm run db:migrate
npm run db:seed

# Development (backend + frontend + bot)
npm run dev

# Or individually
npm run dev -w @vcc/backend   # http://localhost:3001
npm run dev -w @vcc/frontend  # http://localhost:5173
npm run dev -w @vcc/bot       # requires DISCORD_BOT_TOKEN
```

Demo account: `demo@vcc.game` / `demo1234`

## Production

```bash
# Build all packages
npm run build

# Docker
docker compose up -d

# Health check
curl http://localhost:3001/health
```

Copy `.env.example` to `.env` and set `JWT_SECRET` before production deploy.

## Testing

```bash
npm run test:all    # Full local test suite (build, unit, typecheck, smoke, e2e)
npm test            # Unit tests only
npm run typecheck   # Type-check all packages
npm run lint        # ESLint
npm run format      # Prettier write (format:check to verify)
```

CI (`.github/workflows/ci.yml`) runs `npm ci`, `npm run build`, and `npm run test:all` on every push and pull request.

## Project Structure

```
packages/
  shared/     Game engine, card definitions, types
  backend/    REST API, WebSocket, auth, database
  frontend/   React web app
  bot/        Discord bot
scripts/      Test and smoke scripts
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /health | Liveness check (status, uptime, version, timestamp) |
| GET | /health/ready | Readiness check (verifies database connectivity) |
| GET | /metrics | Operational counters (guarded by `METRICS_TOKEN` when set) |
| POST | /api/auth/register | Create account |
| POST | /api/auth/login | Login |
| GET | /api/game/cards | Card catalog |
| GET | /api/game/leaderboard | Rankings |
| POST | /api/game/queue/join | Join matchmaking |
| POST | /api/bot/link-code | Generate bot link code |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
