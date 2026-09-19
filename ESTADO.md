# ESTADO — kankaku-hub

Fecha: 2026-09-20

## Web (`./web`) — Nuxt 4 + PocketBase

### Cómo arrancarlo en desarrollo (dos procesos)

```bash
cd /Users/baldboy/desarrollo/soyun.ninja/kankaku-hub

# Terminal 1: PocketBase (API) en 127.0.0.1:8090
scripts/dev.sh

# Terminal 2: Nuxt dev server en localhost:3000, habla con el 8090
cd web
pnpm install
pnpm dev
```

Login de dev: `david@kankaku.local` / `kankaku-dev-owner`.

### Cómo arrancarlo en modo un-solo-proceso (como en producción)

`nuxt generate` produce un build estático que el propio PocketBase sirve
con `--publicDir` — un solo binario, sin servidor Node:

```bash
cd web
pnpm generate

cd ..
scripts/dev.sh   # --publicDir ya apunta a web/.output/public
```

Con esto `http://127.0.0.1:8090/` sirve la app y `http://127.0.0.1:8090/api/`
el backend, mismo origen — no hace falta `NUXT_PUBLIC_PB_URL`.

**Ojo con un bug ya corregido**: con `ssr:false`, Nuxt por defecto pre-renderiza
una carpeta con `index.html` por cada ruta (`login/index.html`,
`clients/index.html`, …). El servidor estático de PocketBase interpreta esas
carpetas como directorios y hace un 301 a la URL con `/` final, lo que rompe
la resolución de URLs relativas del SDK de PocketBase (`api/...` se resolvía
contra la ruta actual, no contra la raíz — p. ej. `/login/api/...`). Se
arregló de dos formas independientes (ver commits): (1) `nitro.prerender` en
`nuxt.config.ts` ahora solo pre-renderiza `/` (PocketBase ya sirve
`index.html` como fallback de SPA con 200 para cualquier ruta sin archivo
propio, así que no hacen falta las demás carpetas); (2) el cliente de
PocketBase (`app/plugins/pocketbase.client.ts`) usa
`window.location.origin` como base en producción en vez de cadena vacía, para
no depender de resolución relativa en absoluto. Verificado con Playwright
contra el build real servido por PocketBase.

### Qué está hecho

- Las 9 pantallas del encargo: login + guard de auth, dashboard (KPIs,
  comparación con periodo anterior, gráfico de serie temporal
  apilable/cambiable, tablas de desglose por cliente/proyecto, top de
  entradas más costosas, toggle "incluir Sin determinar", refresco en
  vivo con suscripción realtime debounced), clientes (CRUD + archivar,
  `Sin determinar` protegido), proyectos (CRUD + archivar + editor de
  `repo_paths`), detalle de proyecto (KPIs, tendencia, tareas, top
  prompts, desglose por modelo), tareas (tablero por estado + vista de
  lista, CRUD, coste/tiempo acumulado por tarea), cola de "Sin
  determinar" (agrupado por `legacy_client_label` + `repo_project`,
  selección por grupo o fila individual, asignación masiva por lotes de
  50 vía `/api/batch` con barra de progreso), explorador de entradas
  (filtros, paginación/orden en servidor, drawer de detalle con
  `work_records` hijos y aviso de "nunca se suman"), ajustes (tema,
  idioma, URL del hub, usuario, resumen del esquema, versión).
- Shell de la app: sidebar responsive (colapsa a `Sheet` en móvil),
  header con breadcrumbs traducidos, paleta de comandos Ctrl/Cmd+K
  (clientes/proyectos/tareas), toasts, skeletons de carga, estados
  vacíos.
- **Tema oscuro por defecto** vía `@nuxtjs/color-mode`
  (`preference: 'dark'`, `fallback: 'dark'`, sin flash del tema
  incorrecto — verificado con Playwright en perfil nuevo), selector
  oscuro/claro/sistema persistido en `localStorage`.
- `@nuxtjs/i18n`: español por defecto (sin detección automática del
  navegador — es un requisito explícito, ver `nuxt.config.ts`), inglés
  como segundo idioma, selector persistido. Todo el copy de la UI pasa
  por `t(...)`.
- Componentes de UI estilo shadcn-vue escritos a mano en
  `app/components/ui/` (primitivas de `reka-ui` + `cva` + `tailwind-merge`
  + iconos `@lucide/vue`) — el CLI `shadcn-vue add` no funcionó de forma
  fiable en este entorno (su propio `pnpm` interno, descargado vía
  corepack, se quedaba reintentando descargas del registro
  indefinidamente); el resultado final es equivalente.
- Gráficos: componente SVG propio sin dependencias
  (`app/components/charts/StackedBarChart.vue`), en vez de una librería
  de charts — decisión deliberada para no añadir más superficie de
  dependencias dado el entorno con red inestable, cumple el mismo
  contrato visual en ambos temas.
- Regla D6/D7 respetada: **todo** total en la web sale de un `SUM` sobre
  `task_entries` (`app/lib/aggregate.ts`); `work_records` solo aparece
  como detalle de solo-lectura en el drawer de la entrada, con el aviso
  explícito de que nunca se suma.
- Regla D8 respetada: no hay ningún campo de tarifa/precio/margen en la
  UI; `cost` se etiqueta como coste medido en USD.

### Qué está pendiente / decisiones abiertas

- Drag-and-drop real en el tablero de tareas: implementado con botones
  "mover a siguiente estado" en vez de arrastrar — la propia consigna lo
  ofrecía como alternativa válida.
- Cobertura de tests de componentes Vue (solo se testean los helpers
  puros de `app/lib/*` con Vitest, como pedía el encargo, más el e2e de
  Playwright). No hay tests de componentes individuales.
- No se ha probado a fondo con volúmenes de datos mucho mayores que los
  430 `task_entries` de la semilla (el dashboard/proyectos hacen
  `getFullList` sobre el rango de fechas en vez de paginar — razonable a
  esta escala, a revisar si el volumen crece mucho).
- No se ha desplegado nada a ningún VPS; todo es local, sin remoto.

## Verificación del web

- `pnpm install`, `pnpm lint` (`eslint .`), `pnpm typecheck`
  (`nuxt typecheck`), `pnpm test` (Vitest, 41 tests) y `pnpm generate`:
  todos en verde.
- `pnpm test:e2e` (Playwright, 5 specs) verificado **dos veces**: contra
  `nuxt dev` (localhost:3000) y contra el build real servido por
  PocketBase en un solo proceso (`PW_BASE_URL=http://127.0.0.1:8090`) —
  esto último fue lo que hizo saltar el bug de las rutas 301 descrito
  arriba.
- Confirmado manualmente con Playwright en un perfil nuevo (sin
  `localStorage` previo): el tema por defecto es oscuro; cambiar a claro
  y a sistema funciona y persiste.
- Capturas de las pantallas principales en ambos temas en
  `web/docs/screenshots/` (generadas por el propio test e2e).

## kankaku-hub (parte PocketBase)

## Qué está hecho

- Repo inicializado en `main`, sin remoto (no se ha añadido remoto a
  propósito, no se ha hecho push a ningún sitio).
- `pocketbase/pb_migrations/` con 10 migraciones que crean:
  - `clients`, `projects`, `tasks`, `task_entries`, `work_records`.
  - Un campo `role` (`owner` | `service`) en la colección `users` para
    distinguir el usuario humano de la cuenta de servicio de kankaku.
  - Reglas de la API: todo requiere usuario autenticado; escritura de
    `clients`/`projects`/`tasks` solo para `role=owner`; escritura de
    `task_entries`/`work_records` para cualquier usuario autenticado;
    borrado de esas dos últimas solo para `owner`.
  - Endurecimiento de la colección `users`: sin auto-registro público,
    cada usuario solo ve/edita su propio registro.
  - Semilla idempotente del cliente único `Sin determinar`
    (`code: sin-determinar`, `unassigned: true`).
  - Vista de solo lectura `task_entries_daily_totals` (totales por
    proyecto/cliente/día, sumando **solo** `task_entries`).
  - Activación de la API `/api/batch` (desactivada por defecto en
    PocketBase 0.40).
- `pocketbase/seed/seed.js`: script de datos de demo sin dependencias
  (Node ≥ 20, usa `fetch`), determinista y re-ejecutable sin duplicar.
  Ya ejecutado dos veces localmente para comprobarlo.
- `docs/contract.md`: contrato exacto de la API para quien construya el
  cliente de sync de kankaku (o el web). Todos los ejemplos son
  respuestas reales capturadas contra la instancia local, no inventadas.
- `docs/proposal.md`: copia de la propuesta de diseño original.
- `README.md`, `AGENTS.md`: documentación del repo y convenciones.
- `scripts/pb-download.sh`, `scripts/dev.sh`,
  `scripts/create-dev-accounts.sh`: arranque reproducible.
- `pocketbase/pb_data/` está poblado con el resultado de las migraciones
  + las cuentas de dev + los datos de la semilla, listo para que el
  siguiente agente (el del cliente de sync o el del web) lo use sin tener
  que montar nada.

## Qué NO está hecho (fuera de alcance de este encargo)

- El cliente de sync dentro de kankaku (fases 1-2 de la propuesta):
  catálogo cacheado, picker `ctx.ui.select`, `sync-state.json`,
  adaptadores `pocketbase-catalog.ts` / `pocketbase-sink.ts`, etc. Esto
  vive en el repo `kankaku`, no en `kankaku-hub`.
- Backfill real de datos históricos de producción a `Sin determinar`
  (`/kankaku backfill`) — eso también es trabajo del lado de kankaku.
- No se ha desplegado nada a ningún VPS; todo es local.

## Cómo arrancarlo

```bash
cd /Users/baldboy/desarrollo/soyun.ninja/kankaku-hub

# Si hace falta reinstalar el binario (ya está en pocketbase/bin/):
scripts/pb-download.sh

# Arrancar el servidor (aplica migraciones automáticamente)
scripts/dev.sh
# -> Dashboard: http://127.0.0.1:8090/_/
# -> API:       http://127.0.0.1:8090/api/

# En otra terminal, si hace falta recrear las cuentas de dev:
scripts/create-dev-accounts.sh

# Repoblar/completar datos de demo (no duplica si ya existen):
node pocketbase/seed/seed.js
```

`pocketbase/pb_data/` ya está en el repo local con todo esto aplicado
(está en `.gitignore`, así que no se ha commiteado, pero sigue en disco).
Si se borra, los tres comandos de arriba lo reconstruyen entero.

## Credenciales locales (solo dev, no usar en producción)

| Cuenta | Email | Password | Rol |
|---|---|---|---|
| Superusuario PocketBase | `admin@kankaku.local` | `kankaku-dev-admin` | superuser (panel `/_/`) |
| Owner (humano) | `david@kankaku.local` | `kankaku-dev-owner` | `role: owner` |
| Servicio (kankaku sync) | `kankaku-sync@kankaku.local` | `kankaku-dev-sync` | `role: service` |

## Verificación realizada

- Migraciones aplicadas desde `pb_data` vacío: las 10 se aplican sin
  errores (`migrate up`).
- Round-trip completo `migrate down 8` → `migrate up`: revierte y vuelve
  a aplicar todo sin errores (probado sobre un directorio de pruebas
  antes de tocar el `pb_data` real).
- Semilla ejecutada dos veces: mismos recuentos tras la segunda
  ejecución (`clients: 6, projects: 10, tasks: 25, task_entries: 430,
  work_records: 261`).
- Constraint único probado: crear dos veces el mismo `task_id` devuelve
  `400` con `data.task_id.code = "validation_not_unique"` (respuesta real
  capturada en `docs/contract.md`).
- Reglas de auth probadas: listar `task_entries` sin autenticar devuelve
  `200` con `items: []` (el listRule filtra, no da 401/403 — así es como
  funciona PocketBase); crear sin autenticar devuelve `400`; autenticado
  como `service`, listar y crear funcionan.
- Vista `task_entries_daily_totals` devuelve tipos correctos
  (`number`/`text`, no `json`) tras forzar `CAST(...)` en el `SELECT` —
  sin el cast, PocketBase infiere mal los tipos de las columnas `SUM()`.

## Próximos pasos sugeridos

1. Construir el cliente de sync en `kankaku` usando `docs/contract.md`
   como referencia exacta (auth, upsert por `task_id`, manejo del 400 de
   unicidad, batch API).
2. Backfill real de datos históricos de producción (`/kankaku backfill`,
   trabajo del lado de kankaku) — el web ya tiene lista la pantalla de
   "Sin determinar" para asignarlos en cuanto lleguen.
3. Decidir despliegue (VPS): ni el backend ni el web tocan nada de
   infraestructura todavía, todo es local, sin remoto añadido.
