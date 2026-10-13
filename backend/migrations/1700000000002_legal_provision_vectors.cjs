exports.up = (pgm) => {
  pgm.sql('CREATE EXTENSION IF NOT EXISTS vector');
  pgm.sql('ALTER TABLE legal_provisions ADD COLUMN embedding vector(384)');
  pgm.sql('ALTER TABLE legal_provisions ADD COLUMN source_url TEXT NOT NULL DEFAULT \'\'');
  pgm.sql('CREATE INDEX idx_legal_provisions_embedding ON legal_provisions USING hnsw (embedding vector_cosine_ops)');
};

exports.down = (pgm) => {
  pgm.sql('DROP INDEX IF EXISTS idx_legal_provisions_embedding');
  pgm.sql('ALTER TABLE legal_provisions DROP COLUMN source_url');
  pgm.sql('ALTER TABLE legal_provisions DROP COLUMN embedding');
};
