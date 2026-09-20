# Resumen ejecutivo — kankaku ↔ kankaku-hub

*(Ver [`README.md`](README.md) para el índice completo de esta
documentación, en inglés. Este resumen es la única excepción explícita al
inglés como idioma de los artefactos técnicos.)*

## Qué existe hoy

Dos repositorios, ambos **locales, sin remoto, sin desplegar**:

- **kankaku** (rama `feat/pocketbase-hub`, 20 commits por delante de
  `main`/`v0.4.6`, sin publicar): la extensión de pi que ya mide, por
  prompt, cuánto trabaja un agente (excluyendo esperas al usuario) y qué
  cuesta en tokens. Ahora además: credenciales del hub, catálogo
  cacheado, selector de cliente/proyecto al iniciar sesión, sincronización
  con PocketBase (idempotente, con ventana de revisión para subagentes que
  terminan tarde), backfill a "Sin determinar", sincronización automática
  con throttle, y un lock entre procesos.
- **kankaku-hub** (rama `main`): backend PocketBase 0.40.4 (10 migraciones,
  semilla determinista) + una SPA Nuxt 4 (`web/`) con 9 pantallas:
  dashboard, clientes, proyectos, detalle de proyecto, tablero de tareas,
  cola de "Sin determinar", explorador de entradas y ajustes. Tema oscuro
  por defecto (claro/sistema disponibles), español por defecto sin
  detección automática del navegador (inglés como segundo idioma).

Todo lo anterior está **implementado y verificado**: `npm run check` en
kankaku, `pnpm lint/typecheck/test/generate` y Playwright (11/11
especificaciones, dos veces: contra el dev server y contra el build de
producción servido por el propio PocketBase) en el web. Ver
[`phases/README.md`](phases/README.md) para el detalle fase por fase y
[`specs/README.md`](specs/README.md) para el detalle normativo de cada
capacidad.

## La regla que sostiene todo el diseño

El tiempo de una tarea es la **unión** de los intervalos del orquestador y
sus subagentes, nunca su suma (porque un subagente puede seguir corriendo
después de que su orquestador termine). Esa regla vive **una sola vez**, en
kankaku (`buildTasks`), y el hub/web nunca la reimplementan: solo suman
filas ya consolidadas (`task_entries`). Ver
[`architecture/aggregation.md`](architecture/aggregation.md) y
[ADR 0006](adr/0006-aggregation-rule-lives-once-in-kankaku.md).

## Cómo arrancarlo

```bash
# Backend
cd kankaku-hub
scripts/pb-download.sh && scripts/dev.sh
scripts/create-dev-accounts.sh
node pocketbase/seed/seed.js

# Web (otra terminal)
cd kankaku-hub/web
pnpm install && pnpm dev
```

Login de dev: `david@kankaku.local` / `kankaku-dev-owner`. Detalle completo
en [`runbooks/local-development.md`](runbooks/local-development.md) y en
[`../ESTADO.md`](../ESTADO.md).

Para conectar una instalación real de kankaku al hub local:
[`runbooks/connect-kankaku-to-hub.md`](runbooks/connect-kankaku-to-hub.md).

## Qué falta (planificado, no construido)

- **Fase 4 — vinculación de tareas**: `/kankaku task` para enlazar una
  tarea existente del hub. No empezada, deliberadamente pospuesta hasta
  usar las fases 1-3 un tiempo.
- **Fase 5 — creación de tareas desde pi**: `/kankaku task new`, condicional
  a que la fase 4 demuestre que hace falta.
- **Despliegue a un VPS**: nada desplegado todavía; hay un runbook con el
  plan (`runbooks/deploy-to-vps.md`), marcado explícitamente como no
  ejecutado.
- **Publicación de kankaku en npm**: la rama con la integración del hub no
  se ha fusionado a `main` ni publicado; `npm publish` requiere 2FA por
  navegador, así que ese paso lo debe ejecutar el propietario en persona
  (`runbooks/release-kankaku.md`).

## El límite de facturación (no negociable)

Se guarda cliente, proyecto, tarea, tiempo y coste de tokens. **Nunca**
tarifas, precios, márgenes ni números de factura — en ninguna migración,
ninguna pantalla. Es lo que mantiene esto como herramienta de medición y no
como software de facturación. Se cita a Verifactu (España, RD 1007/2023)
como una razón regulatoria para mantener ese límite, pero **eso no está
confirmado con un asesor fiscal** — no tratarlo como hecho legal
establecido. Ver [`vision.md`](vision.md#the-billing-boundary).

## Discrepancias encontradas durante esta documentación

- `README.md` de kankaku-hub describe `web/` como "(future) Nuxt dashboard,
  not part of this repo yet" — ya está completamente implementado; el
  README raíz no se actualizó tras la fase 3. `ESTADO.md` sí refleja el
  estado real.
- La propuesta original (§6.0) menciona `/kankaku sync --since <date>` como
  solución para el caso patológico de un orquestador más viejo que la
  ventana de revisión que gana un hijo tardío. No se encontró evidencia de
  que ese flag exista en el conjunto actual de subcomandos
  (`SYNC_TOKENS = ["all", "status"]`) — documentado como no confirmado en
  [`specs/sync-push.md`](specs/sync-push.md).
