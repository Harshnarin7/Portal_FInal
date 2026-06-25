#!/bin/bash
# ============================================================================
# PORTAL Trial — AWS Deployment Script
# Run this on your AWS EC2 instance after git pull
# ============================================================================

set -e  # Exit on any error

echo ""
echo "======================================================"
echo "  PORTAL Trial — Deployment Starting"
echo "======================================================"
echo ""

# ── 1. Validate required environment variables ──────────────────────────────
required_vars=("SECRET_KEY" "POSTGRES_PASSWORD" "ALLOWED_ORIGINS" "REACT_APP_API_URL")
missing=0
for var in "${required_vars[@]}"; do
  if [[ -z "${!var}" ]]; then
    echo "❌  ERROR: Required env var '$var' is not set."
    missing=1
  fi
done
if [[ $missing -eq 1 ]]; then
  echo ""
  echo "Set the missing variables and re-run this script."
  echo "Example:"
  echo "  export SECRET_KEY=\$(python3 -c \"import secrets; print(secrets.token_urlsafe(32))\")"
  echo "  export POSTGRES_PASSWORD=your_db_password"
  echo "  export ALLOWED_ORIGINS=https://portaltrial.in"
  echo "  export REACT_APP_API_URL=https://api.portaltrial.in"
  exit 1
fi

# ── 2. Build React frontend ──────────────────────────────────────────────────
echo "📦  Building React frontend..."
cd frontend-app
npm ci --silent
REACT_APP_API_URL="$REACT_APP_API_URL" npm run build
echo "✅  Frontend built → frontend-app/build/"
cd ..

# ── 3. Start/restart Docker services ────────────────────────────────────────
echo ""
echo "🐳  Starting Docker services..."
docker compose down --remove-orphans
docker compose build --no-cache backend
docker compose up -d db backend

# ── 4. Wait for backend health check ────────────────────────────────────────
echo ""
echo "⏳  Waiting for backend to be healthy..."
for i in $(seq 1 20); do
  if curl -sf http://localhost:8000/health > /dev/null 2>&1; then
    echo "✅  Backend is healthy!"
    break
  fi
  echo "   Attempt $i/20 — retrying in 3s..."
  sleep 3
  if [[ $i -eq 20 ]]; then
    echo "❌  Backend did not become healthy. Check logs: docker compose logs backend"
    exit 1
  fi
done

echo ""
echo "======================================================"
echo "  ✅  Deployment complete!"
echo "  Backend API: http://localhost:8000"
echo "  Health:      http://localhost:8000/health"
echo "  Frontend build is in: frontend-app/build/"
echo "  Serve it with nginx pointing root to that folder."
echo "======================================================"
