# Contrato_ceroO

ContratoClaro es una aplicación web que detecta cláusulas abusivas en contratos (arriendo, servicios, laborales) y genera una carta de objeción.

## STACK TECNOLÓGICO
- **Frontend**: React + Vite + TailwindCSS
- **Backend**: Node.js + Express
- **Base de datos**: PostgreSQL
- **Extracción de texto**: pdf-parse, Tesseract.js
- **IA**: LLM vía API

## FUNCIONALIDADES
1. Registro/login de usuario (JWT).
2. Subida de contrato en PDF o imagen.
3. Extracción y segmentación de cláusulas.
4. Análisis de riesgo usando IA.
5. Carta de objeción descargable.
