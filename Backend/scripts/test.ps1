# Runs the full verification suite: typecheck, backend tests, and a production build.
# Usage: pwsh ./scripts/test.ps1
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

Write-Host "== 1/4 TypeScript checks (libs + artifacts) =="
pnpm run typecheck
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "== 2/4 Backend automated tests (vitest + supertest) =="
pnpm --filter @workspace/api-server run test
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "== 3/4 Frontend production build =="
pnpm --filter @workspace/web run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "== 4/4 Database integrity check =="
pwsh ./scripts/check-db-integrity.ps1
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "All checks passed."
