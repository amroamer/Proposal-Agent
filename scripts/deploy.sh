#!/bin/sh
# deploy.sh
# Pulls latest code, runs migrations, idempotently bootstraps the first
# admin, rebuilds containers, restarts stack, smoke-tests.
#
# Idempotent: safe to re-run on every push. Server-side data created
# through the UI (proposals, reviews, signups, frameworks edited on
# the VM) is preserved across runs. Frameworks/system seed data is
# delivered via versioned migrations under db/migrations/.
#
# Intended for execution on the target VM.

set -e

cd "$(dirname "$0")/.."

# Load .env so this script sees POSTGRES_*, FIRST_ADMIN_*, etc.
# Without this, init-first-admin.sh exits early on the host check.
if [ -f .env ]; then
    set -a
    . ./.env
    set +a
fi

echo "1/6 Pulling latest code..."
git pull --ff-only

echo "2/6 Building images..."
docker compose -f docker-compose.yml -f docker-compose.prod.yml build

echo "3/6 Running database migrations..."
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm migrations

echo "4/6 Restarting services..."
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

echo "5/6 Bootstrapping first admin (no-op if one already exists)..."
# init-first-admin.sh prints "Superadmin already exists: <email>" on re-run,
# or "Created superadmin: <email>" on first deploy.
./scripts/init-first-admin.sh || {
    echo "WARNING: admin bootstrap failed — check FIRST_ADMIN_EMAIL/FIRST_ADMIN_PASSWORD in .env"
}

echo "6/6 Smoke test..."
sleep 10
curl -fsS https://localhost/ProposalAgent/api/health -k && echo "\nDeploy OK."
