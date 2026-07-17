#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Lumos HRMS — Hostinger VPS Deploy Script
# Run this on the VPS: bash deploy.sh
# ─────────────────────────────────────────────────────────────────────────────
set -e

REPO_URL="https://github.com/YOUR_ORG/YOUR_REPO.git"   # ← change this
APP_DIR="/opt/lumos-hrms"

echo "═══════════════════════════════════════════"
echo " Lumos HRMS — Deploy"
echo "═══════════════════════════════════════════"

# ── 1. Install Docker + Docker Compose (skip if already installed) ────────────
if ! command -v docker &> /dev/null; then
  echo "Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  usermod -aG docker $USER
  systemctl enable docker
  systemctl start docker
  echo "✅ Docker installed"
else
  echo "✅ Docker already installed"
fi

# ── 2. Clone / pull repo ──────────────────────────────────────────────────────
if [ -d "$APP_DIR/.git" ]; then
  echo "Pulling latest code..."
  cd "$APP_DIR" && git pull origin main
else
  echo "Cloning repo..."
  git clone "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
fi

# ── 3. Set up .env if it doesn't exist ───────────────────────────────────────
if [ ! -f "$APP_DIR/.env" ]; then
  echo ""
  echo "⚠️  .env not found. Copying from .env.production..."
  cp "$APP_DIR/.env.production" "$APP_DIR/.env"
  echo ""
  echo "❗ IMPORTANT: Edit .env before continuing:"
  echo "   nano $APP_DIR/.env"
  echo ""
  echo "Fill in: DB_PASSWORD, JWT_SECRET, SMTP_*, CLOUDINARY_*, BIOMETRIC_SERVER_IP"
  echo "Then re-run this script."
  exit 1
fi

# ── 4. Build and start containers ─────────────────────────────────────────────
cd "$APP_DIR"
echo "Building Docker images..."
docker compose build --no-cache

echo "Starting containers..."
docker compose up -d

echo ""
echo "═══════════════════════════════════════════"
echo "✅ Containers running:"
docker compose ps
echo ""
echo "Logs (Ctrl+C to stop watching):"
docker compose logs -f app
