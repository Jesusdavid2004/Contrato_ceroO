/**
 * Migration: 001_initial_english_schema
 * Creates English tables and migrates legacy Spanish data if present.
 */

exports.up = (pgm) => {
  // 1. Users table
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      email VARCHAR(180) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migrate from legacy 'usuario' if exists
  pgm.sql(`
    DO $$
    BEGIN
      IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'usuario') THEN
        INSERT INTO users (id, name, email, password_hash)
        SELECT id::text, nombre, correo, password_hash FROM usuario
        ON CONFLICT (email) DO NOTHING;
      END IF;
    END $$;
  `);

  // 2. Contracts table
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS contracts (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      contract_type VARCHAR(32) NOT NULL DEFAULT 'OTHER',
      jurisdiction VARCHAR(32) NOT NULL DEFAULT 'CO',
      locale VARCHAR(10) NOT NULL DEFAULT 'es',
      status VARCHAR(32) NOT NULL DEFAULT 'UPLOADED',
      global_risk_score INTEGER NOT NULL DEFAULT 0,
      uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      failure_reason TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_contracts_user_id ON contracts(user_id);
    CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);
  `);

  // Migrate from legacy 'contrato' if exists
  pgm.sql(`
    DO $$
    BEGIN
      IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'contrato') THEN
        INSERT INTO contracts (id, user_id, title, file_name, uploaded_at, global_risk_score, status)
        SELECT 
          id::text, 
          usuario_id::text, 
          nombre_archivo, 
          nombre_archivo, 
          fecha_subida, 
          COALESCE(puntaje_riesgo_global::int, 0),
          'READY'
        FROM contrato
        ON CONFLICT (id) DO NOTHING;
      END IF;
    END $$;
  `);

  // 3. Clauses table
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS clauses (
      id VARCHAR(64) PRIMARY KEY,
      contract_id VARCHAR(64) NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
      order_index INTEGER NOT NULL,
      original_text TEXT NOT NULL,
      risk_level VARCHAR(16) NOT NULL,
      confidence NUMERIC(3, 2) NOT NULL DEFAULT 1.0,
      plain_explanation TEXT NOT NULL,
      why_risky TEXT,
      legal_basis JSONB DEFAULT '[]'::jsonb,
      suggested_change TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_clauses_contract_id ON clauses(contract_id);
  `);

  // Migrate from legacy 'clausula' if exists
  pgm.sql(`
    DO $$
    BEGIN
      IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'clausula') THEN
        INSERT INTO clauses (id, contract_id, order_index, original_text, risk_level, plain_explanation, why_risky)
        SELECT 
          id::text, 
          contrato_id::text, 
          orden, 
          texto, 
          LOWER(COALESCE(nivel_riesgo, 'low')), 
          COALESCE(explicacion_simple, ''), 
          razon_legal
        FROM clausula
        ON CONFLICT (id) DO NOTHING;
      END IF;
    END $$;
  `);

  // 4. Objection letters table
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS objection_letters (
      id SERIAL PRIMARY KEY,
      contract_id VARCHAR(64) NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
      locale VARCHAR(10) NOT NULL DEFAULT 'es',
      content TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_objection_letters_contract_id ON objection_letters(contract_id);
  `);

  // Migrate from legacy 'carta_objecion' if exists
  pgm.sql(`
    DO $$
    BEGIN
      IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'carta_objecion') THEN
        INSERT INTO objection_letters (id, contract_id, content, created_at)
        SELECT id, contrato_id::text, contenido, fecha_generacion FROM carta_objecion
        ON CONFLICT (id) DO NOTHING;
      END IF;
    END $$;
  `);

  // 5. AI usage tracking table
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS ai_usage (
      id SERIAL PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      model VARCHAR(64) NOT NULL,
      tokens_used INTEGER NOT NULL DEFAULT 0,
      operation VARCHAR(64) NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_ai_usage_user_date ON ai_usage(user_id, created_at);
  `);

  // 6. Legal provisions table (for RAG)
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS legal_provisions (
      id VARCHAR(64) PRIMARY KEY,
      jurisdiction VARCHAR(32) NOT NULL,
      source_name VARCHAR(120) NOT NULL,
      reference VARCHAR(120) NOT NULL,
      text TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_legal_provisions_jurisdiction ON legal_provisions(jurisdiction);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS legal_provisions CASCADE;
    DROP TABLE IF EXISTS ai_usage CASCADE;
    DROP TABLE IF EXISTS objection_letters CASCADE;
    DROP TABLE IF EXISTS clauses CASCADE;
    DROP TABLE IF EXISTS contracts CASCADE;
    DROP TABLE IF EXISTS users CASCADE;
  `);
};
