#!/usr/bin/env bash
# Runs the full verification suite: typecheck, backend tests, and a production build.
# Usage: ./scripts/test.sh
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== 1/4 TypeScript checks (libs + artifacts) =="
pnpm run typecheck

echo "== 2/4 Backend automated tests (vitest + supertest) =="
pnpm --filter @workspace/api-server run test

echo "== 3/4 Frontend production build =="
pnpm --filter @workspace/web run build

echo "== 4/4 Database integrity check =="
bash scripts/check-db-integrity.sh

echo
echo "All checks passed."
