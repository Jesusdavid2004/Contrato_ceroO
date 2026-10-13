exports.up = (pgm) => {
  pgm.sql('ALTER TABLE ai_usage ADD COLUMN latency_ms INTEGER NOT NULL DEFAULT 0');
};

exports.down = (pgm) => {
  pgm.sql('ALTER TABLE ai_usage DROP COLUMN latency_ms');
};
