# Auditoría del estado actual — ContratoClaro

**Fecha:** 2026-10-13
**Tipo:** auditoría de solo lectura y comparación contra `CLAUDE.md`
**Alcance:** auditoría del código existente, actualizada tras conectar el servidor y la UI al backend nuevo. La extracción, segmentación y análisis asíncrono ya recorren el entrypoint configurado por `npm start` y Docker.

## 1. Resumen ejecutivo

El repositorio avanzó más allá del prototipo que describía la auditoría anterior. Ya hay una base de Clean Architecture en `backend/src`, migración SQL versionada, validación de archivos, autenticación con access/refresh tokens, límites de solicitudes, pruebas del backend, Dockerfiles, Docker Compose multi-servicio y un workflow de CI.

El entrypoint normal ahora compila y arranca `backend/src/server.ts`, ejecutando migraciones antes de escuchar. La UI sube contratos por la API nueva, consulta el estado y adapta el DTO del resultado. Se mantiene `backend/index.js` para las pruebas históricas; aún falta validar el despliegue contra PostgreSQL real y recorrer el flujo completo en navegador.

### Verificación ejecutada

| Comprobación | Resultado |
|---|---|
| `backend`: `npm test` | Correcto: 9 archivos, 72 pruebas aprobadas |
| `backend`: `npm run build` | Correcto: servidor TypeScript compilado |
| `backend`: `npm run type-check` | Correcto |
| `frontend`: `npm run lint` | Correcto, con una advertencia de Fast Refresh en `AuthContext.tsx` |
| `frontend`: `npm run i18n:check` | Correcto: 49 claves sincronizadas |
| `frontend`: `npm run build` | Correcto |

El smoke test del servidor compilado confirmó `GET /api/health` (200). Aún no se ejecutó una prueba de migraciones/repositorios contra PostgreSQL real ni una prueba e2e de navegador.

## 2. Avance que sí existe

- **Arquitectura backend parcial:** entidades, objetos de valor, interfaces, repositorios, casos de uso, middleware, configuración y manejador centralizado en `backend/src`.
- **Persistencia parcial:** repositorios PostgreSQL y una migración inicial con tablas en inglés, incluyendo `users`, `contracts`, `clauses`, `objection_letters`, `ai_usage` y `legal_provisions`.
- **Reglas de dominio:** cálculo ponderado del riesgo en `Contract.ts`; existe cobertura unitaria de dominio.
- **Extracción y segmentación (Fase 4):** PDF con capa de texto mediante `pdf-parse`, límite de 40 páginas, renderizado OCR por visión para PDFs escaneados e imágenes PNG/JPEG, segmentación regex y asistencia Claude cuando hay menos de tres encabezados. Hay fixtures español/inglés y pruebas del adaptador sin llamadas de red.
- **Clasificación de contratos (Fase 5):** proveedor Anthropic con salida estructurada validada por Zod y un retry, lotes de hasta ocho cláusulas, revisión de baja confianza con el modelo smart, cuota diaria reservada por usuario, cache efímero acotado y registro de tokens/latencia. El modo offline usa `FakeAIProvider` para clasificación y cartas, y permite analizar PDFs con texto; OCR sigue requiriendo una clave Anthropic.
- **Arranque y compatibilidad con la UI:** `npm start` y Docker compilan el servidor nuevo, aplican migraciones y arrancan `src/server.ts`; el frontend usa subida, polling de estado y carga del resultado. El worker es local al proceso y los trabajos pendientes se pierden si el servidor se detiene.
- **Seguridad en el backend nuevo:** validación por magic bytes, límite de tamaño, cookies httpOnly para refresh, endpoints de refresh/logout/borrado de cuenta y middleware de rate limit.
- **Base de pruebas y CI:** caracterización del backend, pruebas de dominio y segmentación; workflow de GitHub Actions para type-check, pruebas backend, lint, i18n y build frontend.
- **Infraestructura local:** servicios `db`, `backend` y `frontend` en `docker-compose.yml`, con Dockerfile por servicio.
- **Documentación inicial:** tres ADRs y este informe actualizado.

## 3. Brechas actuales respecto al prompt

| Área | Estado actual y evidencia | Prioridad |
|---|---|---|
| **Ejecución del backend nuevo** | `npm start` compila, migra y ejecuta `dist/src/server.js`, y Docker usa `npm start`; la suite histórica aún caracteriza `../index.js`, pero también existen pruebas del app nuevo. | Media |
| **Rutas y contrato API** | La UI sube por `/api/contracts`, consulta `GET /api/contracts/:id/status` y carga el resultado. El servicio adapta `original_text` a `text` para la pantalla de resultados. Falta una prueba e2e en navegador. | Alta |
| **Persistencia y migraciones** | El arranque ejecuta migraciones y el pool acepta `DATABASE_URL` o variables `DB_*`; Compose provee una URL para el contenedor. Falta probar migraciones y repositorios contra PostgreSQL real. | Alta |
| **Secretos y configuración** | Se mantienen valores predeterminados de desarrollo para facilitar la ejecución local; ahora producción falla al iniciar si faltan JWT_SECRET, DB_PASSWORD/DATABASE_URL o CORS_ORIGIN. Compose usa credenciales exclusivamente de desarrollo y deben reemplazarse al desplegar. | Alta |
| **Autenticación en frontend** | El frontend todavía persiste el access token en `localStorage` y lo manda en `Authorization`; el backend nuevo conserva compatibilidad con ese token y también emite cookie httpOnly. Falta completar el refresh por cookie en el cliente. | Alta |
| **Archivos y borrado** | La validación por magic bytes y tamaño existe en la nueva ruta. Pero `UploadContractUseCase` descarta el identificador devuelto por `FileStorage.store`; luego el borrado de cuenta pasa el ID del contrato a `FileStorage.delete`, que espera una URI `file://...`. Además, el borrado individual de contrato no limpia el archivo. La retención `7d`/`30d` no tiene proceso de expiración visible. | Alta |
| **Análisis de contratos** | La API activa encola el análisis, y el worker procesa extracción, segmentación y clasificación; se persiste el resultado y se expone polling con ownership. La cola es local al proceso, no durable. OCR requiere `ANTHROPIC_API_KEY`; offline admite PDFs con texto. | Alta |
| **IA, cuota y RAG** | Clasificación estructurada, retry, batching, re-check, cache acotado y medición están implementados; la cuota diaria usa reserva transaccional. El contexto legal/RAG, pgvector y retrieval siguen pendientes de la Fase 6. | Alta |
| **Cartas de objeción** | Existen entidad/repositorio y tabla, pero no se encontró caso de uso/ruta completa, edición/preview en UI ni generación de PDF localizado. | Media |
| **Frontend y datos** | Aún usa `fetch` directamente en `AuthContext` y páginas. No hay `api-client.ts`, TanStack Query ni validación Zod de respuestas. No está reorganizado por feature. El frontend no tiene type-check configurado en CI. | Alta |
| **i18n y tema** | La paridad en/es pasa; el idioma se persiste como `cc_locale`, no `lang`. El tema solo maneja `light`/`dark`; no conserva el modo `system` ni reacciona a cambios del SO después de iniciar. No hay script inline de tema antes del primer render, y falta confirmar sincronización de `<html lang>`, formato localizado y disclaimer. | Media |
| **Pruebas** | Las pruebas backend pasan, pero no se observan pruebas frontend, integración con DB real, Playwright, gate de cobertura del 70% ni pruebas de los flujos nuevos por API. La suite de caracterización sigue enfocada en `index.js`. | Alta |
| **CI y calidad** | CI no ejecuta type-check de frontend, pruebas frontend, auditoría de seguridad ni formato. Existe una advertencia lint de Fast Refresh. Prettier no figura en los scripts/dependencias del frontend. | Media |
| **Documentación y entrega** | Hay ADRs, pero faltan documentos requeridos de arquitectura (diagramas Mermaid), API/OpenAPI, evaluación de IA, despliegue, seguridad y demo. Falta verificar README completo, CHANGELOG, seed/demo de un comando y release/tag `v1.0.0`. | Media |
| **Higiene del repositorio** | Git rastrea **1.555 archivos dentro de `node_modules`**. Debe dejar de versionarse el contenido generado y conservarse solo los manifiestos/lockfiles; antes de limpiarlo, comprobar que los cambios de índice sean únicamente dependencias generadas. | Alta |

## 4. Orden recomendado para completar el trabajo

1. **Validar persistencia real:** ejecutar migraciones y pruebas de repositorio contra PostgreSQL; probar auth, ownership, borrado de cuenta y ciclo de vida de archivos. Corregir el almacenamiento de la URI y la eliminación/retención.
2. **Completar IA y cartas:** implementar RAG con pgvector y fuentes oficiales verificadas, generación editable de cartas y PDF localizado.
3. **Endurecer el frontend:** refresh mediante cookie, TanStack Query, validación Zod, estados de carga/error, modo system y pruebas de idioma/tema.
4. **Cerrar gates de calidad:** integración real y Playwright, cobertura de dominio/aplicación, type-check frontend, lint/formato y CI con todos los gates.
5. **Finalizar entrega:** documentación de arquitectura/API/seguridad/despliegue/evaluación/demo, seed de demostración, changelog y release cuando los gates pasen.
6. **Limpiar artefactos versionados:** dejar de rastrear `node_modules` y revisar el diff antes de cualquier eliminación del índice.

## 5. Criterio de cierre de esta fase

Esta auditoría registra el estado actual; los trabajos siguientes deben continuar solo con confirmación, siguiendo el proceso por fases de `CLAUDE.md`. Aunque el entrypoint nuevo ya está activo, la integración con PostgreSQL real sigue sin evidencia de ejecución en este entorno.
