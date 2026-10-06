-- db_schema.sql

CREATE TABLE IF NOT EXISTS usuario (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    correo VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS contrato (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER REFERENCES usuario(id) ON DELETE CASCADE,
    nombre_archivo VARCHAR(255) NOT NULL,
    url_archivo TEXT,
    fecha_subida TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    puntaje_riesgo_global NUMERIC(5, 2) DEFAULT 0
);

CREATE TABLE IF NOT EXISTS clausula (
    id SERIAL PRIMARY KEY,
    contrato_id INTEGER REFERENCES contrato(id) ON DELETE CASCADE,
    texto TEXT NOT NULL,
    nivel_riesgo VARCHAR(50),
    explicacion_simple TEXT,
    razon_legal TEXT,
    orden INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS carta_objecion (
    id SERIAL PRIMARY KEY,
    contrato_id INTEGER REFERENCES contrato(id) ON DELETE CASCADE,
    contenido TEXT NOT NULL,
    fecha_generacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
