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
