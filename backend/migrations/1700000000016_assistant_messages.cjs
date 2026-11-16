// Per-contract assistant conversation. Hard-deleted with the contract (CASCADE).
exports.up = (pgm) => {
  pgm.sql(`CREATE TABLE IF NOT EXISTS assistant_messages (
    id TEXT PRIMARY KEY,
    contract_id VARCHAR(64) NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    user_id VARCHAR(64) NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    citations JSONB NOT NULL DEFAULT '[]'::jsonb,
    grounded BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_assistant_messages_contract
    ON assistant_messages (contract_id, created_at)`);
};

exports.down = (pgm) => {
  pgm.sql('DROP INDEX IF EXISTS idx_assistant_messages_contract');
  pgm.sql('DROP TABLE IF EXISTS assistant_messages CASCADE');
};
