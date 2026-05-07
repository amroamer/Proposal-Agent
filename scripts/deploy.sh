#!/bin/sh
# deploy.sh
# Pulls latest code, runs migrations, rebuilds containers, restarts stack.
# Intended for execution on the target VM.

set -e

cd "$(dirname "$0")/.."

echo "1/5 Pulling latest code..."
git pull --ff-only

echo "2/5 Building images..."
docker compose -f docker-compose.yml -f docker-compose.prod.yml build

echo "3/5 Running database migrations..."
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm migrations

echo "4/5 Restarting services..."
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

echo "5/5 Smoke test..."
sleep 10
curl -fsS https://localhost/ProposalAgent/api/health -k && echo "\nDeploy OK."
