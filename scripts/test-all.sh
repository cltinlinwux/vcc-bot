#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== VCC Test Suite ==="
echo ""

echo "[1/5] Installing dependencies..."
npm install --silent

echo "[2/5] Building shared package..."
npm run build -w @vcc/shared

echo "[3/5] Running shared tests..."
npm run test -w @vcc/shared

echo "[4/5] Type checking all packages..."
npm run typecheck -w @vcc/shared
npm run typecheck -w @vcc/backend
npm run typecheck -w @vcc/frontend
npm run typecheck -w @vcc/bot

echo "[5/5] Building frontend and backend..."
npm run build -w @vcc/backend
npm run build -w @vcc/frontend

echo ""
echo "=== Database setup ==="
npm run db:migrate -w @vcc/backend
npm run db:seed -w @vcc/backend

echo ""
echo "=== API smoke test ==="
node --import tsx "$ROOT/scripts/smoke-test.ts"

echo ""
echo "=== All tests passed ==="
