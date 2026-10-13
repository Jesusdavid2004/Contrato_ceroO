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

## Recuperación de fuentes legales (RAG)

RAG es opcional y permanece desactivado por defecto (`RAG_ENABLED=false`). Para
Colombia, el corpus curado inicial contiene resúmenes breves de la Ley 1480 de
2011 y la Ley 820 de 2003; cada entrada incluye una referencia y un enlace al
Gestor Normativo oficial de Función Pública. Los resúmenes se usan para
recuperación semántica, no sustituyen la consulta de la norma oficial ni son
asesoría legal. Verifica vigencia, alcance y texto de cada fuente oficial antes
de mantener o ampliar el corpus.

Al habilitar RAG, PostgreSQL necesita pgvector (la imagen de Compose ya lo
incluye). El backend descarga una vez `Xenova/multilingual-e5-small` para
generar embeddings localmente; el modelo produce vectores de 384 dimensiones y
no tiene coste por petición. La descarga inicial y el uso requieren disco y
cómputo local. El volumen `embedding-models` de Compose conserva los pesos.
Aplica las migraciones al iniciar el backend y ejecuta `npm run seed:legal` en
`backend/` para cargar el corpus colombiano. Para un entorno local fuera de
Docker, configura `EMBEDDING_CACHE_DIR` si quieres cambiar la ruta de caché.

## Demo local

El backend usa `FakeAIProvider` automáticamente cuando no hay una clave de
Anthropic configurada. Para preparar una cuenta y un contrato sintético en una
base local, define `NODE_ENV=development`, `DEMO_USER_EMAIL` y
`DEMO_USER_PASSWORD` (usa una contraseña de demo única de al menos 12
caracteres) en el entorno local y ejecuta `npm run seed:demo` desde `backend/`.
El comando aplica las migraciones y guarda cláusulas de ejemplo, no un archivo
original. Inicia los servicios con `docker compose up --build` y accede con las
credenciales configuradas. No uses credenciales de demo en producción.

## Evaluación y pruebas de navegador

Desde `backend/`, ejecuta `npm run evaluate` para regenerar
[`docs/evaluation.md`](./docs/evaluation.md) a partir del conjunto sintético de
5 escenarios en `backend/evaluation/samples.json`. La métrica es una prueba de
humo del clasificador offline y no mide la calidad de un proveedor de IA real
ni constituye validación legal.

Desde `frontend/`, ejecuta `npm run test:e2e` para probar Chromium con Playwright.
La suite levanta Vite y simula respuestas de API deterministas; las operaciones
reales de backend también se cubren con pruebas de integración.
