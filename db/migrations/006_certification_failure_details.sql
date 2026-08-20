ALTER TABLE mystery_certification_jobs
  ADD COLUMN IF NOT EXISTS failure_details jsonb;

COMMENT ON COLUMN mystery_certification_jobs.failure_details IS
  'Spoiler-safe structured reasons from the final failed certification attempt.';
