CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Tenants (organizations using the platform)
CREATE TABLE tenants (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(255) NOT NULL,
  slug        VARCHAR(100) NOT NULL UNIQUE,
  plan        VARCHAR(50) NOT NULL DEFAULT 'free',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Users
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(50) NOT NULL DEFAULT 'viewer',
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login    TIMESTAMPTZ
);

-- Sessions (JWT refresh tokens stored here)
CREATE TABLE sessions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(255) NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- API Keys (for programmatic access)
CREATE TABLE api_keys (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by  UUID NOT NULL REFERENCES users(id),
  key_hash    VARCHAR(255) NOT NULL UNIQUE,
  name        VARCHAR(255) NOT NULL,
  scopes      TEXT[] NOT NULL DEFAULT '{}',
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Data sources (registered ingestion endpoints)
CREATE TABLE data_sources (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        VARCHAR(255) NOT NULL,
  source_type VARCHAR(100) NOT NULL,
  config      JSONB NOT NULL DEFAULT '{}',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Events (persistent event storage)
CREATE TABLE events (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_id    UUID REFERENCES data_sources(id),
  severity     VARCHAR(50) NOT NULL DEFAULT 'unknown',
  category     VARCHAR(100) NOT NULL DEFAULT 'general',
  parser_used  VARCHAR(100),
  confidence   FLOAT,
  event_time   TIMESTAMPTZ NOT NULL,
  ingested_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  data         JSONB NOT NULL DEFAULT '{}',
  raw          TEXT
);

-- Alert rules
CREATE TABLE alert_rules (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by  UUID NOT NULL REFERENCES users(id),
  name        VARCHAR(255) NOT NULL,
  condition   TEXT NOT NULL,
  severity    VARCHAR(50) NOT NULL DEFAULT 'error',
  channels    JSONB NOT NULL DEFAULT '[]',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Alert incidents (fired alerts)
CREATE TABLE alert_incidents (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rule_id        UUID NOT NULL REFERENCES alert_rules(id),
  tenant_id      UUID NOT NULL REFERENCES tenants(id),
  status         VARCHAR(50) NOT NULL DEFAULT 'open',
  triggered_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at    TIMESTAMPTZ,
  matched_event  JSONB NOT NULL DEFAULT '{}'
);

-- Saved searches
CREATE TABLE saved_searches (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by  UUID NOT NULL REFERENCES users(id),
  name        VARCHAR(255) NOT NULL,
  query       TEXT NOT NULL,
  filters     JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit logs (every user action tracked)
CREATE TABLE audit_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  user_id     UUID REFERENCES users(id),
  action      VARCHAR(255) NOT NULL,
  resource    VARCHAR(255) NOT NULL,
  metadata    JSONB NOT NULL DEFAULT '{}',
  ip_address  INET,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_events_tenant_time    ON events(tenant_id, event_time DESC);
CREATE INDEX idx_events_severity       ON events(tenant_id, severity);
CREATE INDEX idx_events_data           ON events USING gin(data);
CREATE INDEX idx_audit_logs_tenant     ON audit_logs(tenant_id, created_at DESC);
CREATE INDEX idx_sessions_token        ON sessions(token_hash);
CREATE INDEX idx_api_keys_hash         ON api_keys(key_hash);

-- Seed a default tenant and admin user (password: Admin@123)
INSERT INTO tenants (id, name, slug, plan)
VALUES ('00000000-0000-0000-0000-000000000001', 'Default Org', 'default', 'enterprise');

INSERT INTO users (tenant_id, email, password_hash, role)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'admin@platform.local',
  crypt('Admin@123', gen_salt('bf')),
  'admin'
);