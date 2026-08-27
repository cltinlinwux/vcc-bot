#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# The backend is started on a dedicated port with a throwaway database so the
# suite is fully self-contained and never touches a running dev server or its
# data.
TEST_PORT="${TEST_PORT:-3101}"
API_URL="http://127.0.0.1:${TEST_PORT}"
TEST_DATA_DIR="$(mktemp -d)"
BACKEND_LOG="${TEST_DATA_DIR}/backend.log"
BACKEND_PID=""

stop_backend() {
  if [[ -n "$BACKEND_PID" ]] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    kill "$BACKEND_PID" 2>/dev/null || true
    wait "$BACKEND_PID" 2>/dev/null || true
  fi
  BACKEND_PID=""
}

cleanup() {
  local exit_code=$?
  stop_backend
  if [[ $exit_code -ne 0 && -s "$BACKEND_LOG" ]]; then
    echo ""
    echo "--- Backend log (${BACKEND_LOG}) ---"
    cat "$BACKEND_LOG"
    echo "--- End backend log ---"
  fi
  rm -rf "$TEST_DATA_DIR"
}
trap cleanup EXIT

echo "=== VCC Test Suite ==="
echo ""

echo "[1/10] Installing dependencies..."
npm install --silent

echo "[2/10] Building shared package..."
npm run build -w @vcc/shared

echo "[3/10] Running shared tests..."
npm run test -w @vcc/shared

echo "[4/10] Running backend tests..."
npm run test -w @vcc/backend

echo "[5/10] Running bot tests..."
npm run test -w @vcc/bot

echo "[6/10] Type checking all packages..."
npm run typecheck -w @vcc/shared
npm run typecheck -w @vcc/backend
npm run typecheck -w @vcc/frontend
npm run typecheck -w @vcc/bot

echo "[7/10] Building frontend and backend..."
npm run build -w @vcc/backend
npm run build -w @vcc/frontend

echo "[8/10] Setting up test database..."
export DATABASE_URL="file:${TEST_DATA_DIR}/vcc-test.db"
npm run db:migrate -w @vcc/backend
npm run db:seed -w @vcc/backend

echo "[9/10] Starting backend on port ${TEST_PORT}..."
PORT="$TEST_PORT" HOST=127.0.0.1 NODE_ENV=test RATE_LIMIT_MAX=10000 \
  node packages/backend/dist/index.js >"$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!

ready=""
for _ in $(seq 1 60); do
  if curl -fsS "${API_URL}/health" >/dev/null 2>&1; then
    ready=1
    break
  fi
  if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    echo "Backend process exited before becoming ready." >&2
    exit 1
  fi
  sleep 0.5
done
if [[ -z "$ready" ]]; then
  echo "Backend did not become ready at ${API_URL} within 30s." >&2
  exit 1
fi
echo "Backend ready at ${API_URL} (pid ${BACKEND_PID})."

echo ""
echo "[10/10] Running API smoke test and e2e match tests..."
API_URL="$API_URL" node --import tsx "$ROOT/scripts/smoke-test.ts"
API_URL="$API_URL" node --import tsx --test "$ROOT/scripts/e2e-match.test.ts"

stop_backend

echo ""
echo "=== All tests passed ==="
