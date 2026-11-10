exports.up = (pgm) => {
  pgm.sql(`CREATE TABLE IF NOT EXISTS review_requests (
    id TEXT PRIMARY KEY,
    contract_id VARCHAR(64) NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    user_id VARCHAR(64) NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    note TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  pgm.sql(`CREATE UNIQUE INDEX IF NOT EXISTS uq_review_requests_open
    ON review_requests (contract_id) WHERE status IN ('pending', 'in_review')`);
};

exports.down = (pgm) => {
  pgm.sql('DROP INDEX IF EXISTS uq_review_requests_open');
  pgm.sql('DROP TABLE IF EXISTS review_requests CASCADE');
};
