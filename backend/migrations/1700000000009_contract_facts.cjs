exports.up = (pgm) => {
  pgm.sql(`CREATE TABLE IF NOT EXISTS contract_facts (
    contract_id VARCHAR(64) NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value TEXT,
    status TEXT NOT NULL DEFAULT 'not_found',
    evidence_clause_id VARCHAR(64),
    evidence_quote TEXT,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (contract_id, key)
  )`);
};

exports.down = (pgm) => {
  pgm.sql('DROP TABLE IF EXISTS contract_facts CASCADE');
};
