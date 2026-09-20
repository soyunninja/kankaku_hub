# ESTADO — kankaku-hub

Fecha: 2026-09-20

## Empieza aquí

Todo es **local**: sin remoto de git, sin VPS, sin nada publicado.

> **Acción pendiente del dueño**: hay una migración nueva
> (`1758300011_clients_contact_fields.js`, añade `website`/`contact_email`/
> `contact_phone`/`notes` a `clients`). Reinicia `npm run dev:all` una vez
> para que PocketBase la aplique (se aplica sola al arrancar). Si quieres
> ver los cuatro campos rellenos en los clientes de demo, vuelve a
> ejecutar `npm run pb:seed` después (es idempotente, no duplica nada).
> Mientras no reinicies, la web sigue funcionando: esos cuatro campos
> simplemente se leen vacíos y, si intentas guardarlos, verás un aviso de
> error en vez de un "guardado" falso.

> **Acción pendiente del dueño (favicons de clientes)**: otra migración
> nueva, `1758300012_clients_favicon_fields.js` (añade `favicon`/
> `favicon_source`/`favicon_checked_at` a `clients`), más un directorio
> nuevo `pocketbase/pb_hooks/` con una ruta propia,
> `POST /api/kankaku/clients/{id}/favicon/refresh`, que descarga y guarda
> el favicon de la web de un cliente (solo el dueño puede llamarla; nunca
> se dispara sola). `scripts/dev.sh` ya pasa `--hooksDir` — basta con
> reiniciar `npm run dev:all` una vez para que se apliquen la migración y
> la ruta nueva. Ver [ADR
> 0019](docs/adr/0019-hub-fetches-and-stores-client-favicons.md) para el
> porqué (nunca un servicio externo de favicons, nunca hotlinking directo
> a la web del cliente — siempre PocketBase descargando una vez, bajo
> acción explícita). **La parte web ya está hecha**: cada pantalla que
> muestra un cliente (lista, panel de detalle, dashboard, proyectos,
> registros, cola de "Sin determinar", paleta de comandos) muestra ahora
> su favicon o, si no hay, sus iniciales sobre un color determinista. Tras
> reiniciar, los clientes existentes con `website` no tendrán icono
> todavía (nunca se buscó uno) — abre un cliente y pulsa el botón de
> "Actualizar icono" del panel de detalle (o simplemente vuelve a
> guardarlo sin cambiar nada más y luego edítalo de verdad) para
> buscárselo. Ver
> [`docs/specs/client-favicons.md`](docs/specs/client-favicons.md).

> **Acción pendiente del dueño (sesiones y calidad de medición)**: dos
> migraciones nuevas más. `1758300013_task_entries_agent_and_quality.js`
> añade `agent`/`agent_version`/`plugin`/`plugin_version` y tres campos de
> calidad de medición a `task_entries` (las filas existentes se
> retro-rellenan como `agent: "pi"`, medición completa).
> `1758300014_ignored_sessions_collection.js` añade la colección
> `ignored_sessions` (para descartar una sesión de la cola sin crear una
> tarea falsa) y `1758300015_task_entries_daily_totals_by_agent.js`
> reforma la vista `task_entries_daily_totals` para agrupar también por
> `agent` (cambio de forma: hasta una fila por proyecto/cliente/día/agente
> en vez de por proyecto/cliente/día — ver
> [`docs/contract.md`](docs/contract.md) "Agent and measurement quality"
> y [`docs/specs/hub-schema-and-access-rules.md`](docs/specs/hub-schema-and-access-rules.md)
> `SCHEMA-REQ-016`). Reinicia `npm run dev:all` una vez para que
> PocketBase aplique las tres. Si quieres ver la nueva UI de calidad con
> datos de un segundo agente, vuelve a ejecutar `npm run pb:seed` después
> (añade ~7 filas de demo con `agent: "opencode"`; es idempotente, no
> duplica nada). Mientras no reinicies, la web sigue funcionando: esas
> filas simplemente se leen como si fueran de `pi` con medición completa,
> que es justo el retro-relleno que hace la migración. Hay una entrada de
> navegación nueva, "Sesiones sin tarea" (con contador en la barra
> lateral y en la paleta de comandos Ctrl/Cmd+K), y el detalle de una
> tarea o de un registro ahora muestra las sesiones de kankaku vinculadas
> con un comando para retomarlas (`pi --session <id>`, copiable). Ver
> [`docs/specs/web-sessions.md`](docs/specs/web-sessions.md) y
> [ADR 0024](docs/adr/0024-sessions-link-to-tasks-by-explicit-action.md).

```bash
cd ~/desarrollo/soyun.ninja/kankaku-hub
npm run dev:all      # PARA TRASTEAR: API en :8090 + web con recarga en caliente → http://localhost:3000
```

Ctrl+C para los dos. No hay que compilar nada: guardas un `.vue` y se ve al
instante. El log de PocketBase queda en `pocketbase/dev.log`.

El otro modo, `npm run dev`, es el de **un solo proceso como en producción**:
PocketBase sirve la API y el build estático en http://127.0.0.1:8090. Solo
refleja cambios de la web tras `npm run web:build`. Úsalo para la comprobación
final, no para desarrollar.

Entra con `david@kankaku.local` / `kankaku-dev-owner`. Arranca en **oscuro**;
el botón de la cabecera cambia entre oscuro, claro y sistema.

La base de datos local ya trae datos de ejemplo (6 clientes, 10 proyectos,
25 tareas, 430 entradas en 60 días). Para vaciarla y empezar de cero: borra
`pocketbase/pb_data/`, y luego `npm run dev`, `npm run pb:accounts` y, si
quieres los datos de ejemplo otra vez, `npm run pb:seed`.

Si cambias algo de la web, reconstruye con `npm run web:build` (el modo de un
solo proceso sirve el build estático, no el código fuente).

| Quiero… | Mira |
|---|---|
| Un resumen de todo en castellano | `docs/RESUMEN.es.md` |
| El mapa de la documentación | `docs/README.md` |
| Especificaciones por capacidad | `docs/specs/README.md` |
| Por qué se decidió cada cosa (19 ADR) | `docs/adr/README.md` |
| Fases y su estado real | `docs/phases/README.md` |
| Conectar kankaku (pi) a este hub | `docs/runbooks/connect-kankaku-to-hub.md` |
| Desplegar en el VPS (previsto, sin ejecutar) | `docs/runbooks/deploy-to-vps.md` |
| Capturas de todas las pantallas | `web/docs/screenshots/` |

Estado de la extensión de pi: `~/desarrollo/soyun.ninja/kankaku/ESTADO.md`.

### Verificado al cerrar (2026-09-20)

- Web: `pnpm lint` 0 errores, `pnpm typecheck` limpio, 76 tests unitarios,
  23 pruebas de navegador (Playwright) contra el build servido por PocketBase.
- Favicons de clientes (backend): `npm run hooks:test` (45 pruebas
  `node --test` sobre el parser HTML, el sniffer de bytes mágicos y el
  guard SSRF) en verde. Verificación manual contra una instancia PocketBase
  aislada (copia de `pb_data`, puerto 8092, nunca la de 8090 real): dueño
  → 200, cuenta de servicio → 403, sin token → 401, cliente sin `website`
  → `no_website` sin tocar la red, host `127.0.0.1` → `blocked_host` sin el
  override, y con `KANKAKU_FAVICON_ALLOW_PRIVATE=1` el mismo host sí
  descarga y guarda un PNG de prueba real. Comprobación con red real: la
  ruta contra `https://www.google.com` (sin override) descargó y guardó su
  `favicon.ico` real correctamente.
- El cliente de catálogo de kankaku lee este hub real: 6 clientes, 10
  proyectos, «Sin determinar» fuera del selector.
- La cuenta de servicio **no** puede crear clientes (reglas de acceso OK).
- Nueva pantalla `/commands`: referencia de todos los subcomandos
  `/kankaku` de kankaku (rama `feat/pocketbase-hub`), con filtro,
  copiar-al-portapapeles, insignias «Requiere hub», enlaces a las
  pantallas relacionadas (p. ej. `backfill` → Sin determinar) y un bloque
  de configuración (variables de entorno, `~/.kankaku/credentials.json`,
  snippet de conexión con el origen actual, comando `pi -e` para cargar
  esta rama). Ver `docs/specs/web-commands-reference.md`.

### Pendiente / a decidir

- Componentes `select` y `avatar` siguen escritos a mano; el resto son los
  oficiales de shadcn-vue (tomados del registro, porque el CLI se cuelga con
  pnpm 10.34).
- 15 avisos de ESLint (`vue/require-default-prop`) que vienen del estilo de
  los componentes del registro. No son errores.
- Fases 4 y 5 (enlazar y crear tareas desde pi), despliegue en VPS y
  publicación de kankaku: **previstas, sin empezar**.

---


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

### Pase de pulido visual/UX (2026-09-20)

Revisión de las capturas existentes en `web/docs/screenshots/` detectó una
serie de defectos reales, corregidos en este pase:

1. **KPIs del dashboard**: la rejilla forzaba 8 tarjetas en una sola fila
   en escritorio (`xl:grid-cols-8`), recortando el valor de coste y
   envolviendo etiquetas en 3 líneas. Ahora es `grid-cols-2 md:grid-cols-4`
   (2 columnas en móvil, 2 filas de 4 en escritorio), con `min-w-0` +
   `truncate` + `tabular-nums` en el valor para que nunca se recorte, y la
   línea "vs. periodo anterior" en una sola línea siempre.
2. **Precisión del dinero**: `formatCost` (`app/lib/format.ts`) ahora usa
   2 decimales para importes ≥ 1 USD y hasta 4 decimales para importes
   < 1 USD (los costes por tarea son céntimos). `$12.5683` → `$12.57`;
   `$0.0722` se mantiene con sus 4 decimales significativos. USD se deja
   explícito en Ajustes → Conexión ("Moneda: USD" + nota) y junto al
   coste del dashboard.
3. **Color de las variaciones**: nuevo `deltaTone()`/`MetricPolarity` en
   `app/lib/format.ts` (con tests). Coste, tiempo de espera y coste
   medio/tarea son `lowerIsBetter` (bajar = verde); tiempo de trabajo,
   tiempo total, tareas y tokens son `neutral` (volumen, no calidad) y se
   quedan en gris siempre. `KpiCard.vue` añade además un icono de flecha
   (↑/↓/–) para no depender solo del color.
4. **Gráfico de serie temporal**: reescrito con `useElementSize` de
   VueUse (ResizeObserver) — el `viewBox` del SVG se recalcula al ancho
   real del contenedor en vez de un ancho fijo de 600px, con eje Y
   formateado (horas o USD según la métrica), grupos de barras
   focuseables por teclado (`tabindex`, `role="img"`, resaltado de foco) y
   la leyenda ya envolvía correctamente (se mantiene).
5. **Sidebar en páginas largas**: el shell (`app/layouts/default.vue`) usaba
   `position: fixed` para la sidebar sobre un body que hacía scroll — en
   una captura de página completa (y en la práctica al hacer scroll) el
   fondo de la sidebar no llegaba hasta abajo. Ahora es un layout flex de
   altura completa (`h-dvh`): sidebar `sticky` con su propio alto
   `h-dvh`, área de contenido con su propio `overflow-y-auto`.
6. **i18n**: la cola de "Sin determinar" y la tabla de proyectos tenían
   las cabeceras `Work`/`Cost` sin traducir (texto literal en el
   template, no `t(...)`) — corregido en ambas pantallas y en los
   `sr-only` "Close" de los componentes de diálogo. Filtros de
   Registros (`model`/`machine`) y los estados de entrada
   (`completed`/`aborted`/`interrupted`) también traducidos. Nuevo test
   `tests/i18n.test.ts` compara `es.json`/`en.json` clave a clave y falla
   si divergen o si hay algún valor vacío.
7. Auditadas las 8 pantallas a 390/768/1440px en ambos temas (ver
   capturas regeneradas); no se encontraron más desbordamientos — las
   tablas ya scrollaban horizontalmente dentro de su tarjeta.
8. **Drag-and-drop real en el tablero de tareas**: `useTasks.moveStatus()`
   hace la actualización optimista (muta la lista local antes de esperar
   la respuesta de PocketBase) con rollback si falla la escritura.
   `app/pages/tasks/index.vue` usa HTML5 DnD nativo (`draggable`,
   `dragstart`/`dragover`/`drop`) entre las tres columnas; el botón
   "Mover a: <siguiente estado>" se mantiene como alternativa accesible
   por teclado/puntero.
9. **Cola de "Sin determinar"**: la reasignación masiva ya actualizaba la
   lista local sin recarga completa; se añadió (a) un toast que dice
   cuántos registros se movieron y a qué cliente
   (`unassigned.movedTo`/`unassigned.failedCount`), y (b) una sugerencia
   de cliente por grupo (`app/lib/suggest-client.ts`, con tests) — solo
   por coincidencia EXACTA normalizada (minúsculas, sin espacios/
   puntuación/acentos) contra el nombre o código del cliente. Es
   deliberadamente conservadora: `"Caja Mar"`/`"ACME"` sugieren
   `Cajamar`/`Acme`, pero `"cjamar"` (typo) o `"acme sl"` no sugieren
   nada. Es solo un valor pre-rellenado en el selector del diálogo — el
   usuario sigue teniendo que confirmar la asignación.

**shadcn-vue genuino**: el CLI (`pnpm dlx shadcn-vue add ...` / `npx
shadcn-vue@latest add ...`) seguía colgándose en este entorno, pero no por
falta de red (confirmado con `curl` directo a `registry.npmjs.org` y
`www.shadcn-vue.com`, ambos responden al instante) sino por el paso propio
de pnpm 10.34 "Verifying lockfile against supply-chain policies", que
re-verifica los ~1000 paquetes del lockfile del proyecto uno a uno y no
termina en un tiempo razonable en este sandbox. Como alternativa
legítima (shadcn-vue es "copy-in source"), se descargó el JSON del
registro oficial (`https://www.shadcn-vue.com/r/styles/new-york-v4/<name>.json`)
para cada primitiva en uso y se escribieron los ficheros tal cual:
button, card, input, label, table, tabs, dropdown-menu, checkbox, switch,
skeleton, separator, textarea, dialog, sheet, popover, tooltip, badge
(con una variante `success` añadida a mano para el estado "Activo",
sobre el token `--success` existente, sin tocar el mecanismo del
componente). Quedaron con el kit **hecho a mano** (no del registro) dos
primitivas cuya API oficial es incompatible con los ~15 sitios de uso
actuales sin una reescritura fuera de alcance de este pase: `select`
(la oficial es compositiva — `Select`/`SelectTrigger`/`SelectContent`/
`SelectItem`… — la nuestra es un único `<select>` nativo con
`v-model`+`options`) y `avatar` (la oficial exige componer
`AvatarImage`/`AvatarFallback`; la nuestra tiene una prop `label` que
genera las iniciales). Tampoco se adoptó `sonner` (toast) porque
requiere la dependencia nueva `vue-sonner` y el toast propio
(`useToast.ts` + `Toaster.vue`) ya cubre el mismo contrato sin arriesgar
otra instalación de pnpm. `components.json` ya existía y es válido
(`style: new-york`, `baseColor: neutral`, alias `@/components/ui`,
`iconLibrary: lucide`).

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
  navegador — es un requisito explícito, ver `nuxt.config.ts`), inglés y
  japonés como idiomas adicionales, selector persistido. Todo el copy de
  la UI pasa por `t(...)`. Ver más abajo "Idioma japonés — parte web".
- Componentes de UI genuinos de shadcn-vue en `app/components/ui/`
  (primitivas de `reka-ui` + `cva` + `tailwind-merge` + iconos
  `@lucide/vue`) — ver "Pase de pulido" más abajo para cómo se obtuvieron
  finalmente (el CLI seguía sin funcionar, pero el registro JSON sí).
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
- **Campos de contacto en clientes** (2026-09-20): `website`, email,
  teléfono y notas, opcionales, en el diálogo de crear/editar cliente
  (validación en cliente que refleja la de PocketBase: URL normalizada a
  `https://` al perder el foco, esquema http(s) obligatorio para
  convertirse en enlace, email con formato plausible, teléfono libre solo
  recortado) con errores inline (propios y los que devuelve PocketBase,
  mapeados al campo correcto). La tabla muestra web/email/teléfono como
  enlaces (colapsan por debajo de `md` y truncan para que la tabla nunca
  desborde la página), notas solo como icono indicador con tooltip. Panel
  lateral de detalle del cliente (nuevo, no existía antes) con todos los
  campos, notas en texto plano con saltos de línea preservados (nunca
  `v-html`) y sus proyectos. Ver `docs/specs/web-catalog-management.md`
  (`CATMGMT-REQ-006`–`009`) y `docs/specs/hub-schema-and-access-rules.md`
  (`SCHEMA-REQ-011`).

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

### Verificación del pase de pulido (2026-09-20)

- `pnpm lint`: verde (0 errores; 14 avisos preexistentes
  `vue/require-default-prop` en primitivas del registro oficial de
  shadcn-vue, que no fija valores por defecto en props `class`
  opcionales — es su convención, no un error).
- `pnpm typecheck` (`nuxt typecheck`): verde.
- `pnpm test` (Vitest): **59/59 tests en verde** (41 previos + 8 de
  `formatCost`/`deltaTone`/`deltaDirection`, 2 de paridad `es`/`en`, 8 de
  `suggestClient`).
- `pnpm generate`: verde, build estático servido por PocketBase en un
  solo proceso (`scripts/dev.sh`, puerto 8090).
- `pnpm test:e2e` contra ese build (`PW_BASE_URL=http://127.0.0.1:8090`):
  **11/11 specs en verde** — `e2e/smoke.spec.ts` (ahora con capturas
  extra a 390px) + nuevo `e2e/polish.spec.ts`:
  - valores de KPI sin recorte (`scrollWidth <= clientWidth`) a 1440px y
    390px;
  - el SVG del gráfico ocupa > 90% del ancho de su tarjeta;
  - cabeceras en español ("Trabajo"/"Coste") en la cola de "Sin
    determinar";
  - asignación masiva de extremo a extremo: crea 2 `task_entries` de
    usar-y-tirar contra el cliente `Sin determinar` vía la API REST de
    PocketBase, las asigna por la UI a un cliente real, comprueba que el
    grupo desaparece de la cola sin recargar, que el toast dice cuántas
    filas se movieron y a dónde, y que el desglose "Por cliente" del
    dashboard sube exactamente en 2 tras una navegación SPA (sin
    recarga completa) — y borra esas 2 filas al final pase lo que pase,
    para no dejar nada en la semilla (confirmado con una consulta a la
    API tras la suite: 0 filas `E2E` restantes);
  - tema por defecto oscuro, cambio a claro y a sistema.
- Capturas regeneradas desde el **build de producción** (sin badge de
  devtools): 8 pantallas × oscuro/claro + `dashboard-mobile` ×
  oscuro/claro en `web/docs/screenshots/`. Revisadas una a una: KPIs sin
  recorte, colores de variación correctos, gráfico a ancho completo con
  eje Y legible, sidebar a altura completa en páginas largas (tablero de
  tareas), cabeceras en español, insignia "Activo" con la variante
  `success` añadida al badge oficial.

### Avatares de favicon de clientes — parte web (2026-09-20)

Wire-up en el frontend del backend de favicons ya existente (migración
`1758300012` + `pocketbase/pb_hooks/favicon.pb.js`, ver más abajo y
[`docs/specs/client-favicons.md`](docs/specs/client-favicons.md)):

- Nuevos `app/components/clients/ClientAvatar.vue` (favicon o iniciales
  deterministas sobre un color derivado del `id` del cliente, tomado de
  la misma paleta `--chart-1..5` que ya usan los gráficos — nunca inventa
  colores nuevos) y `ClientName.vue` (avatar + nombre, truncando el
  nombre sin encoger nunca el avatar). Helpers puros en
  `app/lib/client-avatar.ts` (iniciales, hash determinista de color,
  contraste WCAG AA **calculado** de verdad — conversión oklch → sRGB
  lineal → luminancia relativa, no solo afirmado — contra las 10
  variantes claro/oscuro de la paleta, y el builder de URL con
  cache-busting por `updated`), con tests en
  `web/tests/client-avatar.test.ts` (20 tests).
- Cableado en las 9 pantallas/componentes que muestran un nombre de
  cliente: lista de clientes + panel de detalle, tabla "Por cliente" y
  "Entradas más costosas" del dashboard, leyenda del gráfico apilado
  cuando se agrupa por cliente, lista de proyectos y detalle de proyecto,
  explorador de registros, pista de sugerencia de la cola de "Sin
  determinar", y resultados de cliente en la paleta de comandos. El
  `<select>` nativo hecho a mano (ver "Pendiente / a decidir" arriba) no
  puede mostrar un avatar dentro de una `<option>` en ningún navegador —
  documentado como límite deliberado, no como hueco, en
  `docs/specs/client-favicons.md` ("Out of scope"). La pantalla de tareas
  no muestra cliente en absoluto (solo proyecto), así que no aplica.
- Botón "Actualizar icono" (solo dueño, oculto para "Sin determinar") en
  el panel de detalle: spinner mientras está en curso, toast con el
  resultado en texto llano (éxito o los seis motivos de fallo) en
  es/en. Guardar un cliente con `website` cambiado dispara el mismo
  fetch en segundo plano (nunca esperado antes de cerrar el diálogo,
  nunca para "Sin determinar").
- Arreglo de foco de la ficha lateral: el enlace a la web pasa a
  `inline-flex` (el anillo de foco ya no pinta todo el ancho de la
  ficha) y el foco inicial al abrir se redirige al título de la ficha
  (`tabindex="-1"`, vía el evento `open-auto-focus` de reka-ui) en vez de
  caer en ese enlace — el tabulado manual normal sigue llegando a todo
  igual. El drawer de detalle de registros no tiene ese mismo patrón de
  enlace (verificado, no aplica).
- Cambio de maquetación no pedido originalmente pero encajado en el
  mismo trabajo: la insignia Activo/Inactivo del panel de detalle pasa a
  la misma línea que el nombre (antes iba debajo del código), con
  `pr-8` para no chocar con el botón de cerrar.

**Verificación**: `pnpm lint` 0 errores (mismos avisos preexistentes de
siempre), `pnpm typecheck` verde, `pnpm test` **141/141 tests en verde**
(121 previos + 20 de `client-avatar.test.ts`), `pnpm generate` verde.
`pnpm test:e2e` completo (**63/63 specs en verde**, incluido el nuevo
`e2e/client-avatars.spec.ts`) contra una copia aislada completa de
`web/` (para evitar el candado de `nuxt dev` sobre `.nuxt` que impide dos
`nuxt dev` sobre el mismo directorio) + copia de `pb_data` en el puerto
8092 con `KANKAKU_FAVICON_ALLOW_PRIVATE=1` + un servidor de fixture local
(puerto 8099, favicon real de 1×1 px) para que los resultados
`ok`/`fetch_failed` del botón de refresco sean deterministas — nunca se
tocó el proceso del dueño en 8090/3000 (confirmado antes y después).

**Defecto preexistente corregido de paso**: `e2e/polish.spec.ts` llamaba
a la API de PocketBase con rutas relativas (`request.post('/api/...')`),
resueltas por Playwright contra `baseURL` — la web, no PocketBase. En
`npm run dev:all` (dos procesos, web en :3000 y PocketBase en :8090) eso
apunta al origen equivocado; en `npm run dev` (un proceso, PocketBase
sirve ambos) coincidían por casualidad y el bug quedaba oculto. Arreglo:
nuevos `apiLogin`/`findClients`/`pbUrl`/`pbOrigin` en `e2e/helpers.ts`
(mismo criterio de resolución que `app/plugins/pocketbase.client.ts`:
`NUXT_PUBLIC_PB_URL` si está definida, si no `http://127.0.0.1:8090`),
usados ahora por todas las llamadas directas a la API de `polish.spec.ts`.
Verificado precisamente en el modo donde antes fallaba (`nuxt dev`,
web y PocketBase en puertos distintos): las 63 specs en verde.

### Idioma japonés — parte web (2026-09-20)

Tercer idioma de la UI (`ja`, japonés), además de español/inglés:
`web/i18n/locales/ja.json` (paridad exacta de claves con `es.json`, sin
placeholders `{...}` perdidos ni añadidos, verificado en
`tests/i18n.test.ts`) construido a partir de un glosario propio
(`web/i18n/GLOSSARY.md`, ~50 términos, con una lista aparte de los que
más conviene que revise alguien que conozca bien japonés). El selector de
idioma de la cabecera ya era un desplegable genérico que itera
`locales`, así que solo hizo falta registrar `ja` en `nuxt.config.ts`
para que apareciera; se le añadió además un check visual en la opción
activa. Duraciones ahora son conscientes del idioma
(`app/lib/format.ts`/`useFormatters()`): en japonés `2時間30分` en vez de
`2h 30m`; fechas y números compactos usan `Intl` con el locale activo
(`ja-JP` da recuentos de tokens en base 万, p. ej. `81.7万`, que es lo
correcto en japonés). Pila de fuentes CJK añadida (sin descarga de
fuentes web) y reglas de salto de línea propias de `:lang(ja)`. El
repaso de maquetación en japonés a 390/768/1440px encontró y corrigió
dos problemas reales específicos del japonés (no presentes en
es/en): los valores de las tarjetas KPI del dashboard se recortaban en
el grid móvil de 2 columnas por lo anchos que son los kanji frente al
inglés/español, y dos etiquetas del panel de detalle de entrada
("サブエージェント", "リポジトリのパス") se partían a media palabra en
columnas estrechas. El texto en `ja.json` está traducido por un agente,
no revisado por hablante nativo — se documenta así, sin disimularlo, en
`docs/specs/web-theming-and-i18n.md`.

**Verificación**: `pnpm lint` 0 errores (mismos avisos preexistentes),
`pnpm typecheck` verde, `pnpm test` **164/164 tests en verde** (141
previos + 23 nuevos de i18n/formatters), `pnpm generate` verde. `pnpm
test:e2e` completo contra la misma copia aislada + PocketBase en 8092 +
servidor de fixture de favicons en 8099: **75/76 specs en verde**; el
único fallo (`client-avatars.spec.ts`, foco inicial del panel de
cliente) se reprodujo igual sobre un `git worktree` limpio del HEAD
anterior a este trabajo — preexistente, no relacionado con japonés, no
tocado aquí.

### Sesiones y calidad de medición — parte web (2026-09-20)

El hub deja de asumir un único agente: cada `task_entries` ahora declara
qué agente lo produjo y qué tan fiable es cada cifra (migración
`1758300013` — ver "Agent and measurement quality" en
`docs/contract.md`). Sobre esa base se construyó un flujo centrado en
**sesiones** (todas las `task_entries` que comparten `session_id`, es
decir, una ejecución de kankaku) en vez de en prompts sueltos:

- **Cola "Sesiones sin tarea"** (`/sessions-without-task`, entrada nueva
  en la barra lateral y en la paleta de comandos, con contador en vivo):
  lista toda sesión cuyas entradas están **todas** sin tarea asignada, y
  ofrece exactamente tres acciones explícitas por sesión (nunca
  automáticas) — convertir en tarea nueva, adjuntar a una tarea
  existente, o ignorar. "Ignorar" crea una fila en la colección nueva
  `ignored_sessions` (migración `1758300014`) en vez de una tarea falsa o
  un flag en `localStorage`, así que la decisión sobrevive entre
  máquinas del dueño. Ver [ADR
  0024](docs/adr/0024-sessions-link-to-tasks-by-explicit-action.md).
- **Retomar sesión**: un comando `pi --session <id>` (con `cd` al repo si
  se conoce) calculado al vuelo, nunca guardado en ningún sitio — visible
  con botón de copiar en el detalle de un registro (`app/pages/entries`)
  y en el detalle de una tarea (`app/pages/tasks`, que ahora lista todas
  las sesiones vinculadas a esa tarea con sus totales). Solo `pi` tiene
  comando de retomado hoy; otro agente reportado muestra un aviso claro
  en vez de un comando inventado.
- **Identidad de agente e indicadores de calidad**: icono/insignia por
  agente (`app/lib/agents.ts` + `web/public/agents/` — para añadir un
  agente nuevo: soltar su icono en `web/public/agents/` y añadir una
  línea al registro), columna y filtro de agente en el explorador de
  registros, filtro de calidad (`waitingUnavailable`/`costUnknown`), y en
  el dashboard: filtro de agente, aviso de honestidad cuando el tiempo de
  trabajo visible incluye alguna cota superior (con enlace de un clic al
  explorador filtrado), y coste medio/tarea que excluye las filas de
  coste desconocido (las sumas totales las siguen incluyendo).
- La vista `task_entries_daily_totals` ahora agrupa también por `agent`
  (migración `1758300015` — cambio de forma que rompe la anterior; ver el
  aviso al principio de este fichero).
- La semilla (`pocketbase/seed/seed.js`) añade ~7 filas de demo con
  `agent: "opencode"` (PRNG propio y aislado) para que la UI de calidad
  tenga algo que mostrar sin tocar los datos de `pi` existentes.

Documentación normativa completa en
[`docs/specs/web-sessions.md`](docs/specs/web-sessions.md) (specs
`web-tasks.md`/`web-entries-explorer.md`/`web-dashboard.md` también
actualizadas con los requisitos nuevos).

**Verificación**: los helpers puros (agrupación de sesiones, derivación
del comando de retomado, registro de agentes, calidad de medición) tienen
cobertura de Vitest (`session-aggregate.test.ts`, `session-resume.test.ts`,
`agents.test.ts`, `measurement-quality.test.ts`). Un trabajo paralelo
añadió además cobertura de Playwright de los flujos de UI —
`web/e2e/session-resume.spec.ts` (bloque de retomado + hoja de detalle de
tarea), `web/e2e/sessions-queue.spec.ts` (convertir/adjuntar/ignorar) y
`web/e2e/agent-quality.spec.ts` (filtro de agente, aviso de honestidad del
dashboard, desbordamiento a 390px) — presentes en el árbol de trabajo pero
**todavía sin commitear** en el momento de escribir esto. Sin cobertura
dedicada todavía, ni de unidad ni end-to-end: el fallback de retomado
cuando una sesión tiene agentes mixtos en la hoja de detalle de tarea, y
el contador compartido de la barra lateral/paleta de comandos.

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

### Campos de contacto de `clients` (migración `1758300011`)

Verificado sobre una copia aislada de `pb_data` (puertos 8092/3002, nunca
se tocó el proceso del dueño en 8090/3000):

- `migrate up` desde el estado ya migrado del dueño: aplica sin errores;
  `migrate down 1` seguido de `migrate up`: revierte exactamente los
  cuatro campos nuevos (`website`, `contact_email`, `contact_phone`,
  `notes`) y los vuelve a crear, sin tocar `name`/`code`/`active`/
  `unassigned`/`created`/`updated`.
- Round-trip real por la API: crear un cliente con los cuatro campos y
  volver a leerlo devuelve los mismos valores, incluidas las líneas
  múltiples de `notes`.
- El rol `service` sigue sin poder escribir `clients` (incluidos estos
  cuatro campos): `400` con el cuerpo genérico
  `{"data":{},"message":"Failed to create record.","status":400}`, igual
  que para el resto de campos.
- Comportamiento real contra un `pb_data` que TODAVÍA no tiene la
  migración aplicada (probado con una copia limpia del `pb_data` del
  dueño, sin el fichero de migración cargado): un `GET` de un cliente
  existente no trae esos cuatro campos en absoluto (`undefined` en JS, no
  `""`); un `POST`/`PATCH` que los incluya devuelve `200` pero PocketBase
  los descarta en silencio — la web detecta esto último y muestra un
  aviso de error en vez de un "guardado" falso (ver
  `web/app/pages/clients/index.vue`, comprobación `contactFieldsDropped`).
- `pocketbase/seed/seed.js` ejecutado dos veces contra la copia aislada:
  la segunda vez no crea clientes nuevos pero sí refresca los cuatro
  campos de contacto de los 5 clientes de demo (comportamiento
  documentado en la cabecera del script); "Sin determinar" nunca se toca.

## Próximos pasos sugeridos

1. Construir el cliente de sync en `kankaku` usando `docs/contract.md`
   como referencia exacta (auth, upsert por `task_id`, manejo del 400 de
   unicidad, batch API).
2. Backfill real de datos históricos de producción (`/kankaku backfill`,
   trabajo del lado de kankaku) — el web ya tiene lista la pantalla de
   "Sin determinar" para asignarlos en cuanto lleguen.
3. Decidir despliegue (VPS): ni el backend ni el web tocan nada de
   infraestructura todavía, todo es local, sin remoto añadido.
