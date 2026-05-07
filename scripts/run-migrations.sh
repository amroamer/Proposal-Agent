#!/bin/sh
# run-migrations.sh
# Applies all pending SQL migrations in /app/db/migrations in lexical order.
# Tracks applied versions in migrations_history table.

set -e

MIGRATIONS_DIR="${MIGRATIONS_DIR:-/app/db/migrations}"

if [ -z "$DATABASE_URL" ]; then
    echo "ERROR: DATABASE_URL is not set"
    exit 1
fi

# Parse DATABASE_URL into psql-usable env vars
# Expected format: postgresql://user:password@host:port/dbname
python3 > /tmp/pgenv <<'EOF'
import os
from urllib.parse import urlparse
u = urlparse(os.environ["DATABASE_URL"])
print(f"PGHOST={u.hostname}")
print(f"PGPORT={u.port or 5432}")
print(f"PGUSER={u.username}")
print(f"PGPASSWORD={u.password}")
print(f"PGDATABASE={u.path.lstrip('/')}")
EOF
. /tmp/pgenv
export PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE

echo "Running migrations from $MIGRATIONS_DIR against $PGDATABASE@$PGHOST"

# Ensure migrations_history exists (V001 creates it, but we need to check first)
APPLIED=$(psql -tAc "SELECT version FROM migrations_history ORDER BY version" 2>/dev/null || echo "")

for f in $(ls "$MIGRATIONS_DIR"/V*.sql | sort); do
    version=$(basename "$f" | cut -d'_' -f1)
    if echo "$APPLIED" | grep -q "^$version$"; then
        echo "  [SKIP] $version (already applied)"
    else
        echo "  [APPLY] $version -- $f"
        psql -v ON_ERROR_STOP=1 -f "$f"
    fi
done

echo "Migrations complete."
