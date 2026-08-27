# Contributing to VCC

Thanks for your interest in contributing! This document covers how to get a
development environment running and what to check before submitting changes.

## Prerequisites

- Node.js 20 (see `.nvmrc` — run `nvm use` if you use nvm)
- npm 10+

## Development Setup

```bash
# 1. Install dependencies (npm workspaces monorepo)
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env as needed. Discord bot variables are optional for local dev.

# 3. Set up the database
npm run db:migrate
npm run db:seed

# 4. Start everything (backend + frontend + bot)
npm run dev
```

The seed creates a demo account: `demo@vcc.game` / `demo1234`.

## Project Layout

```
packages/
  shared/     Game engine, card definitions, types (build this first)
  backend/    REST API, WebSocket, auth, database
  frontend/   React web app
  bot/        Discord bot
scripts/      Test and smoke scripts
```

## Testing

Run the full suite before opening a pull request:

```bash
npm run test:all
```

This runs `scripts/test-all.sh`, which installs dependencies, builds packages,
runs unit tests, type-checks everything, and then boots a throwaway backend to
run API smoke and e2e match tests. All steps must pass.

Faster loops during development:

```bash
npm test                    # unit tests in all workspaces
npm run test -w @vcc/shared # a single workspace
npm run typecheck           # type-check all workspaces
```

## Linting and Formatting

```bash
npm run lint          # ESLint across the repo
npm run format:check  # Prettier check
npm run format        # Prettier write
```

## Submitting Changes

1. Create a feature branch off `main`.
2. Keep changes focused; match the existing code style.
3. Make sure `npm run test:all` and `npm run lint` pass.
4. Open a pull request with a clear description of what changed and why.

For security issues, see [SECURITY.md](SECURITY.md) — do not open public
issues for vulnerabilities.
