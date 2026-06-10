CREATE DATABASE IF NOT EXISTS platform;

-- Events table optimized for analytics
CREATE TABLE IF NOT EXISTS platform.events (
  id           UUID,
  tenant_id    UUID,
  source_type  String,
  source_id    String,
  severity     LowCardinality(String),
  category     LowCardinality(String),
  parser_used  LowCardinality(String),
  confidence   Float32,
  event_time   DateTime64(3, 'UTC'),
  ingested_at  DateTime64(3, 'UTC'),
  data         String,
  raw          String
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(event_time)
ORDER BY (tenant_id, event_time, severity)
TTL event_time + INTERVAL 90 DAY;

-- Materialized view for severity counts per hour
CREATE MATERIALIZED VIEW IF NOT EXISTS platform.events_by_severity_hourly
ENGINE = SummingMergeTree()
ORDER BY (tenant_id, hour, severity)
AS SELECT
  tenant_id,
  toStartOfHour(event_time) AS hour,
  severity,
  count() AS event_count
FROM platform.events
GROUP BY tenant_id, hour, severity;