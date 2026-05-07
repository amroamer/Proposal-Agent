#!/bin/sh
# init-first-admin.sh
# Creates the first superadmin user from FIRST_ADMIN_EMAIL / FIRST_ADMIN_PASSWORD.
# Idempotent: no-op if a superadmin already exists.

set -e

if [ -z "$FIRST_ADMIN_EMAIL" ] || [ -z "$FIRST_ADMIN_PASSWORD" ]; then
    echo "ERROR: FIRST_ADMIN_EMAIL and FIRST_ADMIN_PASSWORD must be set"
    exit 1
fi

docker compose exec -T backend python -c "
import asyncio, os
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import select
from app.models.user import User
from app.core.security import hash_password

async def main():
    engine = create_async_engine(os.environ['DATABASE_URL'])
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as db:
        existing = (await db.execute(select(User).where(User.is_superadmin == True))).scalars().first()
        if existing:
            print(f'Superadmin already exists: {existing.email}')
            return
        u = User(
            email=os.environ['FIRST_ADMIN_EMAIL'].lower(),
            full_name='System Administrator',
            hashed_password=hash_password(os.environ['FIRST_ADMIN_PASSWORD']),
            is_active=True,
            is_email_verified=True,
            is_superadmin=True,
        )
        db.add(u)
        await db.commit()
        print(f'Created superadmin: {u.email}')

asyncio.run(main())
"
