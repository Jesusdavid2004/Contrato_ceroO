// Legal radar: change detection state per official source plus the updates it produced.
exports.up = (pgm) => {
  pgm.sql(`CREATE TABLE IF NOT EXISTS legal_source_state (
    source_id TEXT PRIMARY KEY,
    content_hash TEXT NOT NULL,
    checked_at TIMESTAMP WITH TIME ZONE NOT NULL
  )`);
  pgm.sql(`CREATE TABLE IF NOT EXISTS legal_updates (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    tema TEXT NOT NULL,
    title TEXT NOT NULL,
    source_url TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    detected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (source_id, content_hash)
  )`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_legal_updates_tema_detected
    ON legal_updates (tema, detected_at DESC)`);
};

exports.down = (pgm) => {
  pgm.sql('DROP INDEX IF EXISTS idx_legal_updates_tema_detected');
  pgm.sql('DROP TABLE IF EXISTS legal_updates CASCADE');
  pgm.sql('DROP TABLE IF EXISTS legal_source_state CASCADE');
};
