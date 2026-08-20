CREATE TABLE IF NOT EXISTS mystery_certification_jobs (
  id uuid PRIMARY KEY,
  owner_id text NOT NULL,
  workflow_run_id text UNIQUE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'succeeded', 'failed')),
  storyline_fingerprint text,
  error_code text,
  error_message text,
  retryable boolean,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS mystery_certification_jobs_owner_updated_idx
  ON mystery_certification_jobs (owner_id, updated_at DESC);
