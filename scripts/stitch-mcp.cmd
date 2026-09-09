@echo off
for /f "delims=" %%T in ('"C:\Users\Hp\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd" auth print-access-token') do set "STITCH_ACCESS_TOKEN=%%T"

set "GOOGLE_CLOUD_PROJECT=portal-trial"
set "STITCH_PROJECT_ID=12412710980398408832"

npx @_davideast/stitch-mcp proxy