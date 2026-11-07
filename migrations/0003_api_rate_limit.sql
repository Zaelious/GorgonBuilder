-- Atomic shared fixed-window limits for auth and API mutations (no IP/user plaintext).
-- Expired entries are pruned in bounded batches; each identity reuses one row per scope.
CREATE TABLE api_rate_limit (
  key TEXT NOT NULL PRIMARY KEY,
  window_start INTEGER NOT NULL,
  attempts INTEGER NOT NULL
);
CREATE INDEX api_rate_limit_expiry_idx ON api_rate_limit(window_start);
