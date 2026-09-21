# ESTADO — kankaku-hub

Actualizado: 2026-09-21. Todo es **local**: sin remoto de git, sin VPS, nada
publicado. Las notas de trabajo anteriores (900 líneas) están en
`docs/history/ESTADO-hasta-2026-09-21.md`.

## Empieza aquí

```bash
cd ~/desarrollo/soyun.ninja/kankaku-hub
npm run dev:all      # PARA TRASTEAR: API en :8090 + web con recarga → http://localhost:3000
```

Entra con `david@kankaku.local` / `kankaku-dev-owner`. Oscuro por defecto; el
botón de la cabecera cambia entre oscuro, claro y sistema. Idiomas: español,
inglés y japonés.

- **Trastea siempre en el 3000.** El 8090 sirve el build estático: solo cambia
  tras `npm run web:build` (regenerado el 21-09 con todo lo de abajo).
- Panel de administración de PocketBase: `http://127.0.0.1:8090/_/` →
  `admin@kankaku.local` / `kankaku-dev-admin`.
- Cuenta de servicio (la que usa kankaku): `kankaku-sync@kankaku.local` /
  `kankaku-dev-sync`.
- Web pública (Astro): `cd site && pnpm dev` → `http://localhost:4321`.

> **Ojo con tu PocketBase.** El 21-09 por la mañana lo encontré caído (lo habías
> reiniciado a las 07:47 y murió después, sin error en el log; lo más probable
> es que lo matara la limpieza de procesos de un agente). Lo levanté yo con
> `scripts/dev.sh`, así que **ahora no cuelga de tu terminal**: si haces Ctrl+C
> en `dev:all` y el 8090 sigue vivo, ciérralo con `lsof -ti :8090 | xargs kill`.
> Tus datos están intactos (lo comprobé: 7 clientes, 10 proyectos, 25 tareas).

## Qué hay

**PocketBase 0.40.4** — migraciones `1758300001`–`1758300018`:
clientes (con web, contacto, notas y favicon), proyectos, tareas, `task_entries`
(filas ya consolidadas, con agente, calidad de medición y `session_dir`),
`work_records` (detalle, nunca se suma), `ignored_sessions`, vista de totales
diarios. Dos hooks de servidor: descarga del favicon de un cliente (con
protección contra direcciones internas) y **"En curso" automático** (una tarea
abierta pasa a en curso cuando se le enlaza trabajo; nunca cierra ni reabre).

**Web (Nuxt 4 + shadcn-vue)** — Panel, Clientes, Proyectos y detalle, Tareas
(tablero con arrastrar, selector de estado en el panel y flechas del teclado),
Sin determinar, **Sesiones sin tarea**, Registros (con panel de detalle),
Comandos, Ajustes.
- **Sesiones:** cada registro y cada tarea muestran el comando para volver a la
  conversación de pi (`cd <repo> && pi --session <id>`), con botón de copiar. No
  se guarda ninguna conversación: solo la referencia.
- **Agente y calidad:** icono del agente (pi, OpenCode) y avisos cuando una
  cifra es aproximada (espera no medida → el tiempo de trabajo es un techo;
  coste estimado o desconocido → fuera de las medias).
- Los días son **tu día local** en todas las pantallas.

**Web pública (Astro, `site/`)** — tres páginas por idioma (Inicio, Guía,
Comandos), estética de consola, JetBrainsMono Nerd Font servida desde la propia
web, cero JavaScript, sin peticiones a terceros.

**Documentación (`docs/`)** — especificaciones con requisitos numerados, ADR,
fases, runbooks. Empieza por `docs/RESUMEN.es.md`.

## Revisión independiente del 21-09 (todo arreglado)

Una revisión adversaria de todo lo nuevo encontró:

- **GRAVE — la cuenta de servicio podía hacerse propietaria.** Un usuario podía
  editar su propio `role`. Como esa credencial va en cada instalación de
  kankaku, un token filtrado daba el control del hub. Estaba ahí desde el primer
  día. Arreglado en la migración `1758300017`; lo reproduje antes (`200`, pasaba
  a `owner`) y después (`404`, sigue `service`). Ya aplicado en tu base.
- La protección contra direcciones internas se saltaba con un punto final
  (`localhost.`). Cerrado.
- Los filtros de fecha mezclaban hora local y UTC: una entrada cerca de
  medianoche caía en días distintos según la pantalla. Ahora todo usa tu día
  local, con prueba en Tokio y Los Ángeles.
- La ficha de proyecto metía ceros de coste desconocido en la media.
- El tiempo total de una sesión se sumaba entre tareas que pueden solaparse.
  Ahora se muestra el tiempo transcurrido real (primera a última actividad).
- Los avisos de la interfaz eran invisibles para lectores de pantalla; faltaban
  nombres accesibles en varios botones de icono. Hay una prueba que recorre
  todas las pantallas.
- `migrate down` no sobrevive a un reinicio (PocketBase re-aplica los ficheros
  presentes): documentado el procedimiento correcto.
- Una condición de carrera en la carga compartida de clientes, proyectos y
  tareas, que hacía inestable una prueba.

Salió **limpio**: las reglas de acceso (incluida la API por lotes), el hook de
"En curso", el saneado del comando de reanudar (rutas hostiles), que nada suma
`work_records`, el japonés, y todo lo que afirma la web pública.

## Verificación

- Web: `pnpm lint` 0 errores · `pnpm typecheck` limpio · **267** tests unitarios
  · **109** pruebas de navegador · `pnpm generate` correcto.
- Hooks: **52** tests (`npm run hooks:test`).
- Web pública: build limpio, idiomas y enlaces verificados, **37** pruebas
  contra el build real.
- Las pruebas que escriben **se niegan a escribir** salvo con
  `E2E_ALLOW_PB_WRITES=1`, y siempre se ejecutan contra una copia aislada.

## Pendiente

- **Traducción japonesa:** escrita por un modelo, sin revisar por un nativo. El
  glosario está en `web/i18n/GLOSSARY.md`; la web pública y Ajustes lo avisan.
- **Web pública:** falta el dominio real (`SITE_URL`) y un enlace a un repo
  público del hub. El terminal animado mostraba una salida de `/kankaku`
  inventada; la sustituí por el formato real.
- Los componentes `select` y `avatar` siguen escritos a mano (el resto son los
  oficiales de shadcn-vue, tomados del registro porque su CLI se cuelga con
  pnpm 10.34).
- 19 avisos de ESLint del estilo de los componentes del registro. No son errores.
- A 90 días de datos la web pide las entradas sin paginar en el servidor; bien
  con datos de ejemplo, a revisar cuando haya volumen real.
- Despliegue en VPS: previsto y sin ejecutar (`docs/runbooks/deploy-to-vps.md`).
  **Antes de exponerlo:** cuentas nuevas con contraseñas de verdad, HTTPS, y
  releer la sección de seguridad de ese runbook.
- Estado de la extensión de pi: `~/desarrollo/soyun.ninja/kankaku/ESTADO.md`.

## Para empezar de cero

Borra `pocketbase/pb_data/`, y luego `npm run dev`, `npm run pb:accounts` y, si
quieres los datos de ejemplo, `npm run pb:seed`.
