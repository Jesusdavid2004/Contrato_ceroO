exports.up = (pgm) => {
  pgm.sql('ALTER TABLE contracts ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP');
  pgm.sql('UPDATE contracts SET status_updated_at = uploaded_at WHERE status_updated_at IS NULL');
  pgm.sql('CREATE INDEX IF NOT EXISTS idx_contracts_status_updated ON contracts(status, status_updated_at)');
};

exports.down = (pgm) => {
  pgm.sql('DROP INDEX IF EXISTS idx_contracts_status_updated');
  pgm.sql('ALTER TABLE contracts DROP COLUMN IF EXISTS status_updated_at');
};
