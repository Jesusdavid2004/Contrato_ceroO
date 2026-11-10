// Backfill honesto: sin revision juridica nada existente es "supported".
// CO+LEASE queda experimental (perfil inicial), el resto unsupported.
exports.up = (pgm) => {
  pgm.sql('ALTER TABLE contracts ADD COLUMN IF NOT EXISTS user_role TEXT');
  pgm.sql('ALTER TABLE contracts ADD COLUMN IF NOT EXISTS coverage_status TEXT');
  pgm.sql('ALTER TABLE contracts ADD COLUMN IF NOT EXISTS coverage_rules_version TEXT');
  pgm.sql("UPDATE contracts SET user_role = COALESCE(user_role, 'other')");
  pgm.sql(`UPDATE contracts SET coverage_status = COALESCE(coverage_status,
    CASE WHEN jurisdiction = 'CO' AND contract_type = 'LEASE'
      THEN 'experimental' ELSE 'unsupported' END)`);
  pgm.sql(`UPDATE contracts SET coverage_rules_version =
    COALESCE(coverage_rules_version, 'coverage-rules-v1')`);
};

exports.down = (pgm) => {
  pgm.sql('ALTER TABLE contracts DROP COLUMN IF EXISTS coverage_rules_version');
  pgm.sql('ALTER TABLE contracts DROP COLUMN IF EXISTS coverage_status');
  pgm.sql('ALTER TABLE contracts DROP COLUMN IF EXISTS user_role');
};
