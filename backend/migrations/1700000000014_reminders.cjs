exports.up = (pgm) => {
  pgm.sql(`CREATE TABLE IF NOT EXISTS reminders (
    id TEXT PRIMARY KEY,
    contract_id VARCHAR(64) NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    user_id VARCHAR(64) NOT NULL,
    title TEXT NOT NULL,
    due_at TIMESTAMP WITH TIME ZONE NOT NULL,
    timezone TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  pgm.sql(`CREATE UNIQUE INDEX IF NOT EXISTS uq_reminders_pending
    ON reminders (contract_id, title, due_at) WHERE status = 'pending'`);
};

exports.down = (pgm) => {
  pgm.sql('DROP INDEX IF EXISTS uq_reminders_pending');
  pgm.sql('DROP TABLE IF EXISTS reminders CASCADE');
};
