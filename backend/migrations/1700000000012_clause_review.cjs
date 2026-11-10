exports.up = (pgm) => {
  pgm.sql('ALTER TABLE clauses ADD COLUMN IF NOT EXISTS requires_review BOOLEAN NOT NULL DEFAULT FALSE');
  pgm.sql('UPDATE clauses SET requires_review = (confidence < 0.6) WHERE requires_review = FALSE');
};

exports.down = (pgm) => {
  pgm.sql('ALTER TABLE clauses DROP COLUMN IF EXISTS requires_review');
};
