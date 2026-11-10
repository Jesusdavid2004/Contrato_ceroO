exports.up = (pgm) => {
  pgm.sql(`CREATE TABLE IF NOT EXISTS analysis_jobs (
    id TEXT PRIMARY KEY,
    contract_id VARCHAR(64) NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    user_id VARCHAR(64) NOT NULL,
    staging_key TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    run_after TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    lease_owner TEXT,
    lease_expires_at TIMESTAMP WITH TIME ZONE,
    error_key TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  pgm.sql(`CREATE UNIQUE INDEX IF NOT EXISTS uq_analysis_jobs_active
    ON analysis_jobs (contract_id) WHERE status IN ('queued', 'running')`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_analysis_jobs_claim
    ON analysis_jobs (status, run_after)`);
};

exports.down = (pgm) => {
  pgm.sql('DROP INDEX IF EXISTS idx_analysis_jobs_claim');
  pgm.sql('DROP INDEX IF EXISTS uq_analysis_jobs_active');
  pgm.sql('DROP TABLE IF EXISTS analysis_jobs CASCADE');
};
