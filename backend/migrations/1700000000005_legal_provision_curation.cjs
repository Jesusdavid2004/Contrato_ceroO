// Legal corpus curation fields: thematic domain + validity tracking.
exports.up = (pgm) => {
  pgm.sql(`ALTER TABLE legal_provisions
    ADD COLUMN IF NOT EXISTS tema TEXT NOT NULL DEFAULT 'general'`);
  pgm.sql('ALTER TABLE legal_provisions ADD COLUMN IF NOT EXISTS vigencia_desde DATE');
  pgm.sql('ALTER TABLE legal_provisions ADD COLUMN IF NOT EXISTS fuente_verificada_en DATE');
};

exports.down = (pgm) => {
  pgm.sql('ALTER TABLE legal_provisions DROP COLUMN IF EXISTS fuente_verificada_en');
  pgm.sql('ALTER TABLE legal_provisions DROP COLUMN IF EXISTS vigencia_desde');
  pgm.sql(`ALTER TABLE legal_provisions DROP COLUMN IF EXISTS tema`);
};
