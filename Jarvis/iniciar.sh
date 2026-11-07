#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$(realpath "$0")")"
ROOT="$(pwd)"
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "J.A.R.V.I.S. requer Node.js 18+ e npm."; exit 1
fi
if [ ! -f backend/.env ]; then
  cp backend/.env.example backend/.env
  echo "Criado backend/.env. Configure DATABASE_URL e FOURSQUARE_API_KEY antes de iniciar."
  echo "Edite: $ROOT/backend/.env"
  exit 2
fi
if [ ! -d backend/node_modules ]; then (cd backend && npm install); fi
if [ ! -d frontend/node_modules ]; then (cd frontend && npm install); fi
(cd backend && npx prisma generate && npx prisma db push && npm run db:seed)
(cd backend && npm run dev) >> "$ROOT/jarvis-backend.log" 2>&1 &
BACKEND_PID=$!
cleanup(){ kill "$BACKEND_PID" 2>/dev/null || true; }
trap cleanup EXIT INT TERM
sleep 3
echo "J.A.R.V.I.S. disponível em http://localhost:5173"
(cd frontend && npm run dev -- --host 127.0.0.1)
