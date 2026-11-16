exports.up = (pgm) => {
  pgm.sql(`CREATE TABLE IF NOT EXISTS clause_proposals (
    id TEXT PRIMARY KEY,
    contract_id VARCHAR(64) NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    clause_id VARCHAR(64) NOT NULL,
    original_text TEXT NOT NULL,
    proposed_text TEXT NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    version INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (clause_id, version)
  )`);
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_clause_proposals_contract ON clause_proposals(contract_id)');
};

exports.down = (pgm) => {
  pgm.sql('DROP INDEX IF EXISTS idx_clause_proposals_contract');
  pgm.sql('DROP TABLE IF EXISTS clause_proposals CASCADE');
};
