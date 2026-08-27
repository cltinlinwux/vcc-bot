# VCC — Virtual Card Combat

Online card battle game with Discord bot companion. Production-ready monorepo with real-time PvP, ranked matchmaking, and bot integration.

## Stack

- **Backend**: Node.js, Express, SQLite, Socket.io, JWT auth
- **Frontend**: React 19, Vite, Tailwind CSS
- **Bot**: Discord.js slash commands
- **Shared**: TypeScript game engine and types

## Quick Start

```bash
# Install
npm install

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
npm run test:all    # Full local test suite
npm test            # Unit tests only
```

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
| GET | /health | Health check |
| POST | /api/auth/register | Create account |
| POST | /api/auth/login | Login |
| GET | /api/game/cards | Card catalog |
| GET | /api/game/leaderboard | Rankings |
| POST | /api/game/queue/join | Join matchmaking |
| POST | /api/bot/link-code | Generate bot link code |

## License

Private project.
