# Smoke test wrapper (Windows PowerShell). See smoke-prod.mjs for steps.
node (Join-Path $PSScriptRoot 'smoke-prod.mjs') @args
exit $LASTEXITCODE
