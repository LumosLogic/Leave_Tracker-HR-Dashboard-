#!/bin/sh
set -e

echo "🚀 Starting Lumos HRMS..."

# Run DB migrations (safe to run on every restart — all idempotent)
node backend/scripts/migrate.js

# Start the app
exec node backend/src/server.js
