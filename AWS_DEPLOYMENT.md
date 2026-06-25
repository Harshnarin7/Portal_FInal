# PORTAL Trial — AWS Deployment Guide

## Prerequisites on your AWS EC2 instance
- Ubuntu 22.04 LTS
- Docker + Docker Compose installed
- Nginx installed (`sudo apt install nginx`)
- Python 3.11+ (for local builds if needed)
- Node.js 20+ and npm

---

## Step 1 — Clone the repo
```bash
git clone https://github.com/Harshnarin7/Portal_FInal.git
cd Portal_FInal
```

## Step 2 — Set environment variables
```bash
# Generate a strong secret key
export SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_urlsafe(32))")

# Set your DB password
export POSTGRES_PASSWORD=your_strong_db_password_here

# Your AWS frontend domain/IP (what users open in the browser)
export ALLOWED_ORIGINS=https://portaltrial.in

# Your AWS backend URL (what the React app calls for API)
export REACT_APP_API_URL=https://api.portaltrial.in
```

> **Tip:** Put these in `/etc/environment` or a `.env` file on the server so they survive reboots. Never commit `.env` to Git.

## Step 3 — Run the deploy script
```bash
chmod +x deploy.sh
./deploy.sh
```
This will:
1. Validate all required env vars are set
2. Build the React frontend with the correct API URL baked in
3. Start PostgreSQL + FastAPI via Docker
4. Verify the backend is healthy

## Step 4 — Serve the frontend with Nginx
```bash
# Copy the build to nginx's web root
sudo mkdir -p /var/www/portal
sudo cp -r frontend-app/build /var/www/portal/frontend-app/

# Install the nginx config
sudo cp nginx.conf /etc/nginx/sites-available/portal
sudo ln -sf /etc/nginx/sites-available/portal /etc/nginx/sites-enabled/portal
sudo nginx -t
sudo systemctl reload nginx
```

## Step 5 — Verify
- Health check: `curl http://localhost:8000/health`
- App: open your domain in the browser

---

## Environment Variable Reference

| Variable | Where set | Description |
|---|---|---|
| `SECRET_KEY` | Server env / Docker | JWT signing key — must be 32+ random chars |
| `POSTGRES_PASSWORD` | Server env / Docker | PostgreSQL password |
| `DATABASE_URL` | Auto-set by docker-compose | PostgreSQL connection string |
| `ALLOWED_ORIGINS` | Server env / Docker | Comma-separated frontend URLs for CORS |
| `REACT_APP_API_URL` | Set before `npm run build` | Backend URL baked into the React bundle |

---

## Removing the SQLite DB from git history
If `portal_trial.db` was previously committed, purge it:
```bash
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch portal_trial.db" \
  --prune-empty --tag-name-filter cat -- --all
git push origin --force --all
```
