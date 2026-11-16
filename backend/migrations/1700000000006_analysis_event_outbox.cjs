exports.up = (pgm) => {
  pgm.sql(`CREATE TABLE IF NOT EXISTS analysis_event_outbox (
    id TEXT PRIMARY KEY,
    contract_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    job_id TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    type TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}',
    occurred_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    published BOOLEAN NOT NULL DEFAULT FALSE,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (contract_id, sequence)
  )`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_analysis_event_outbox_unpublished
    ON analysis_event_outbox (published, created_at) WHERE published = FALSE`);
};

exports.down = (pgm) => {
  pgm.sql('DROP INDEX IF EXISTS idx_analysis_event_outbox_unpublished');
  pgm.sql('DROP TABLE IF EXISTS analysis_event_outbox');
};
