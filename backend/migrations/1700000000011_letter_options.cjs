exports.up = (pgm) => {
  pgm.sql('ALTER TABLE objection_letters ADD COLUMN IF NOT EXISTS recipient TEXT');
  pgm.sql("ALTER TABLE objection_letters ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'clarification'");
  pgm.sql("ALTER TABLE objection_letters ADD COLUMN IF NOT EXISTS tone TEXT NOT NULL DEFAULT 'respectful'");
  pgm.sql("ALTER TABLE objection_letters ADD COLUMN IF NOT EXISTS selected_clause_ids JSONB NOT NULL DEFAULT '[]'");
};

exports.down = (pgm) => {
  pgm.sql('ALTER TABLE objection_letters DROP COLUMN IF EXISTS selected_clause_ids');
  pgm.sql('ALTER TABLE objection_letters DROP COLUMN IF EXISTS tone');
  pgm.sql('ALTER TABLE objection_letters DROP COLUMN IF EXISTS purpose');
  pgm.sql('ALTER TABLE objection_letters DROP COLUMN IF EXISTS recipient');
};
