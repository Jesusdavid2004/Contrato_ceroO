exports.up = (pgm) => {
  pgm.sql('ALTER TABLE clauses ADD COLUMN IF NOT EXISTS page_number INTEGER');
  pgm.sql('ALTER TABLE clauses ADD COLUMN IF NOT EXISTS start_offset INTEGER');
  pgm.sql('ALTER TABLE clauses ADD COLUMN IF NOT EXISTS end_offset INTEGER');
};

exports.down = (pgm) => {
  pgm.sql('ALTER TABLE clauses DROP COLUMN IF EXISTS end_offset');
  pgm.sql('ALTER TABLE clauses DROP COLUMN IF EXISTS start_offset');
  pgm.sql('ALTER TABLE clauses DROP COLUMN IF EXISTS page_number');
};
