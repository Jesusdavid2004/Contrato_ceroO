exports.up = (pgm) => {
  pgm.sql('ALTER TABLE contracts ADD COLUMN IF NOT EXISTS storage_uri TEXT');
};

exports.down = (pgm) => {
  pgm.sql('ALTER TABLE contracts DROP COLUMN IF EXISTS storage_uri');
};
