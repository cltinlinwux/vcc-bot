#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BACKEND_PID=""

cleanup() {
  if [[ -n "$BACKEND_PID" ]] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    kill "$BACKEND_PID" 2>/dev/null || true
    wait "$BACKEND_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "=== VCC Test Suite ==="
echo ""

echo "[1/7] Installing dependencies..."
npm install --silent

echo "[2/7] Building shared package..."
npm run build -w @vcc/shared

echo "[3/7] Running shared tests..."
npm run test -w @vcc/shared

echo "[4/7] Running backend tests..."
npm run test -w @vcc/backend

echo "[5/7] Type checking all packages..."
npm run typecheck -w @vcc/shared
npm run typecheck -w @vcc/backend
npm run typecheck -w @vcc/frontend
npm run typecheck -w @vcc/bot

echo "[6/7] Building frontend and backend..."
npm run build -w @vcc/backend
npm run build -w @vcc/frontend

echo "[7/7] Database setup..."
npm run db:migrate -w @vcc/backend
npm run db:seed -w @vcc/backend

echo ""
echo "=== Starting backend for smoke test ==="
npm run start -w @vcc/backend &
BACKEND_PID=$!
for i in $(seq 1 30); do
  if curl -sf http://localhost:3001/health >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

echo ""
echo "=== API smoke test ==="
node --import tsx "$ROOT/scripts/smoke-test.ts"

echo ""
echo "=== All tests passed ==="
