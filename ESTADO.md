# ESTADO — kankaku-hub (parte PocketBase)

Fecha: 2026-09-20

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
- El web en `./web` (Nuxt + shadcn-vue, fase 3). `--publicDir` en
  `scripts/dev.sh` ya apunta a `web/.output/public` para cuando exista,
  pero ese directorio hoy solo contiene un placeholder vacío.
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
2. Cuando exista, `nuxt generate` el web en `./web` y apuntar
   `--publicDir` (ya preparado en `scripts/dev.sh`) al build real.
3. Decidir despliegue (VPS): esta parte no toca nada de infraestructura,
   solo deja el backend funcionando en local.
