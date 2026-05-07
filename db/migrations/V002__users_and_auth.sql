-- ============================================================
-- V002__users_and_auth.sql
-- Purpose: users table, email verification, password reset,
--          refresh-token revocation list, audit events
-- Phase: 1
-- ============================================================

BEGIN;

-- ---------- users ----------
CREATE TABLE IF NOT EXISTS users (
    id                  BIGSERIAL PRIMARY KEY,
    email               VARCHAR(254) NOT NULL UNIQUE,
    full_name           VARCHAR(200) NOT NULL DEFAULT '',
    hashed_password     VARCHAR(255) NOT NULL,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    is_email_verified   BOOLEAN NOT NULL DEFAULT FALSE,
    is_superadmin       BOOLEAN NOT NULL DEFAULT FALSE,
    failed_login_count  INTEGER NOT NULL DEFAULT 0,
    locked_until        TIMESTAMPTZ,
    last_login_at       TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_users_email_active ON users(email) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_created_at  ON users(created_at);

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- email verification tokens ----------
CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id            BIGSERIAL PRIMARY KEY,
    user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash    VARCHAR(255) NOT NULL UNIQUE,
    expires_at    TIMESTAMPTZ NOT NULL,
    used_at       TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evt_user_unused
    ON email_verification_tokens(user_id) WHERE used_at IS NULL;

-- ---------- password reset tokens ----------
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id            BIGSERIAL PRIMARY KEY,
    user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash    VARCHAR(255) NOT NULL UNIQUE,
    expires_at    TIMESTAMPTZ NOT NULL,
    used_at       TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prt_user_unused
    ON password_reset_tokens(user_id) WHERE used_at IS NULL;

-- ---------- user sessions (refresh token tracking) ----------
CREATE TABLE IF NOT EXISTS user_sessions (
    id            BIGSERIAL PRIMARY KEY,
    user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    jti           VARCHAR(64)  NOT NULL UNIQUE,
    user_agent    VARCHAR(500),
    ip_address    VARCHAR(45),
    issued_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at    TIMESTAMPTZ NOT NULL,
    revoked_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_active
    ON user_sessions(user_id) WHERE revoked_at IS NULL;

-- ---------- audit events (immutable) ----------
CREATE TABLE IF NOT EXISTS audit_events (
    id            BIGSERIAL PRIMARY KEY,
    actor_user_id BIGINT REFERENCES users(id),
    action        VARCHAR(100) NOT NULL,
    entity_type   VARCHAR(100),
    entity_id     VARCHAR(100),
    metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip_address    VARCHAR(45),
    user_agent    VARCHAR(500),
    occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_actor_time  ON audit_events(actor_user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action_time ON audit_events(action, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity      ON audit_events(entity_type, entity_id);

-- Enforce append-only on audit_events
CREATE OR REPLACE FUNCTION audit_events_deny_update_delete()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'audit_events is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_no_update ON audit_events;
CREATE TRIGGER trg_audit_no_update BEFORE UPDATE OR DELETE ON audit_events
    FOR EACH ROW EXECUTE FUNCTION audit_events_deny_update_delete();

INSERT INTO migrations_history (version, description)
VALUES ('V002', 'users_and_auth: users, tokens, sessions, audit_events')
ON CONFLICT (version) DO NOTHING;

COMMIT;
