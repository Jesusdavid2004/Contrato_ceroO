# ContratoClaro — Laboratorio de Patrones de Renderizado

**Fecha:** 2026-10-19  
**Servicio:** `rendering-lab/` — Next.js 15 App Router  
**Estado:** Fase 2 completada ✅

---

## 1. Arquitectura del Laboratorio

El laboratorio de renderizado (`rendering-lab/`) es un servicio Next.js 15 independiente que demuestra los
cinco patrones de renderizado de React/Next.js con ejemplos reales del dominio de ContratoClaro.

```
rendering-lab/
├── src/app/
│   ├── layout.tsx          # Root layout con nav y metadatos globales
│   ├── page.tsx            # Página de inicio con tarjetas de cada patrón
│   ├── csr/page.tsx        # Pattern 1: Client-Side Rendering
│   ├── ssr/page.tsx        # Pattern 2: Server-Side Rendering
│   ├── ssg/page.tsx        # Pattern 3: Static Site Generation
│   ├── isr/page.tsx        # Pattern 4: Incremental Static Regeneration
│   ├── streaming/page.tsx  # Pattern 5: Streaming SSR con Suspense
│   └── dashboard/page.tsx  # Panel de métricas comparativo
└── src/app/globals.css     # Sistema de diseño (dark theme, badges, animaciones)
```

---

## 2. Los Cinco Patrones de Renderizado

### 2.1 CSR — Client-Side Rendering (`/csr`)

| Característica | Valor |
|---|---|
| Directiva | `'use client'` |
| TTFB estimado | ~80ms |
| FCP estimado | ~600ms |
| SEO | Bajo (índice vacío sin JS) |
| Cache-Control | No aplica (assets: immutable) |
| Ejecución | Navegador |

**Implementación:** Dashboard interactivo de cláusulas de contrato con filtrado multi-dimensional (por nivel de riesgo y categoría) y acordeones expansibles. Todo el estado (`useState`, `useMemo`) se gestiona en el navegador. No hay round-trips al servidor para actualizar la lista.

**Cuándo usar:** Dashboards privados de usuario, interfaces con estado complejo, filtros dinámicos, componentes altamente interactivos que no requieren indexación SEO.

---

### 2.2 SSR — Server-Side Rendering (`/ssr`)

| Característica | Valor |
|---|---|
| Directiva | `export const dynamic = 'force-dynamic'` |
| TTFB estimado | ~200ms |
| FCP estimado | ~280ms |
| SEO | Excelente (HTML completo en respuesta) |
| Cache-Control | `no-store` |
| Ejecución | Node.js Server |

**Implementación:** Página de jurisprudencia contractual renderizada en el servidor en cada solicitud. El timestamp del servidor (hora de Bogotá) embebido en el HTML prueba que la generación ocurre en tiempo real. El navegador recibe HTML completo — el contenido es visible sin JavaScript.

**Cuándo usar:** Datos en tiempo real, páginas que dependen de autenticación o sesión, contenido que cambia con cada solicitud, precios o inventarios en vivo.

---

### 2.3 SSG — Static Site Generation (`/ssg`)

| Característica | Valor |
|---|---|
| Directiva | `export const dynamic = 'force-static'` + `generateStaticParams()` |
| TTFB estimado | ~20ms |
| FCP estimado | ~100ms |
| SEO | Perfecto |
| Cache-Control | `public, max-age=31536000, immutable` |
| Ejecución | CDN Edge |

**Implementación:** Guías legales educativas sobre arrendamiento, contratos laborales y servicios civiles. `generateStaticParams()` pre-genera rutas para 3 slugs en tiempo de compilación (`npm run build`). Los archivos HTML resultantes se sirven desde CDN con caché de larga duración.

**Garantía de Privacidad:** El contenido es exclusivamente informativo y público. Ningún dato privado de usuario es incluido en páginas SSG.

**Cuándo usar:** Documentación, blogs, landing pages, guías educativas — contenido estable donde el SEO y la velocidad son críticos.

---

### 2.4 ISR — Incremental Static Regeneration (`/isr`)

| Característica | Valor |
|---|---|
| Directiva | `export const revalidate = 60` |
| TTFB estimado | ~25ms |
| FCP estimado | ~110ms |
| SEO | Excelente |
| Cache-Control | `stale-while-revalidate=60` |
| Ejecución | CDN Edge + Node.js Server (background) |

**Implementación:** Glosario de términos contractuales legales. El export `revalidate = 60` activa la estrategia stale-while-revalidate: la primera solicitud sirve el HTML estático en caché, y Next.js regenera la página en segundo plano cada 60 segundos. Los timestamps de generación y próxima revalidación en la UI prueban el comportamiento ISR.

**Cuándo usar:** Catálogos de productos, glosarios, páginas de precios, contenido que cambia periódicamente (minutos/horas) pero no en tiempo real.

---

### 2.5 Streaming SSR + Suspense (`/streaming`)

| Característica | Valor |
|---|---|
| Directiva | `export const dynamic = 'force-dynamic'` + `<Suspense>` |
| TTFB estimado | ~50ms |
| FCP estimado | ~150ms |
| LCP estimado | ~280ms (progresivo) |
| SEO | Bueno (HTML completo en stream) |
| Ejecución | Node.js Server (chunked transfer) |

**Implementación:** Diagnóstico contractual con 3 secciones asíncronas independientes (RSC):
1. `<HeaderSection>` — simula 50ms (métricas generales)
2. `<RiskAnalysisSection>` — simula 300ms (análisis de riesgo por cláusula)
3. `<RecommendationsSection>` — simula 600ms (recomendaciones legales)

Cada sección está envuelta en `<Suspense fallback={<SkeletonCard />}>`. Next.js transmite el HTML vía chunked transfer encoding (HTTP/1.1) o multiplexing (HTTP/2). El navegador pinta cada bloque en cuanto llega, sin bloquear el hilo principal.

**Cuándo usar:** Páginas complejas con múltiples fuentes de datos con latencias diferentes, dashboards donde importa el tiempo al primer contenido visible.

---

## 3. Panel de Métricas Comparativo (`/dashboard`)

El dashboard (`/dashboard`) presenta:
- **Tabla comparativa:** TTFB, FCP, LCP, puntuación SEO, Cache-Control, ejecución y soporte de streaming.
- **Barras de progreso visual:** Comparativa gráfica de TTFB / FCP / LCP con codificación de color (verde < 100ms, amarillo < 300ms, rojo > 300ms).
- **Anillos SVG de SEO:** Visualización del puntaje de indexabilidad para cada patrón.
- **Guía de selección:** Tabla de casos de uso recomendados por patrón.

---

## 4. Garantías de Privacidad y Seguridad

> **Principio:** Los datos privados de usuarios (contratos, cláusulas, cartas de objeción) NUNCA deben aparecer en páginas SSG, ISR ni en ningún caché compartido.

- Todas las páginas SSG e ISR usan exclusivamente datos de demostración codificados en el fuente.
- No hay llamadas al backend de ContratoClaro desde el servidor de Next.js en páginas estáticas.
- Las páginas SSR y Streaming que potencialmente consultarían datos de usuario requieren autenticación explícita (fuera del alcance del laboratorio de demostración).

---

## 5. Cómo ejecutar el laboratorio

```bash
cd rendering-lab
npm install
npm run dev    # http://localhost:3000
npm run build  # Validar SSG y ISR
npm start      # Producción local
```

---

## 6. Referencias

- [Next.js 15 App Router Docs](https://nextjs.org/docs/app)
- [React Server Components RFC](https://github.com/reactjs/rfcs/blob/main/text/0188-server-components.md)
- [Web Vitals](https://web.dev/vitals/)
- [Ley 820 de 2003 — Arrendamiento Urbano](https://www.alcaldiabogota.gov.co/sisjur/normas/Norma1.jsp?i=8738)
