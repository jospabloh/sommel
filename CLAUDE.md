# Sommel: notas del proyecto

Lee también `AGENTS.md` (contexto Base44 y flujo de deploy). Este archivo es el
registro fechado del cumplimiento del estándar ACACIA
(`jospabloh/acacia-app-standard`): qué se hizo, con qué evidencia y, sobre todo,
qué **no** se pudo verificar. Cada sección lleva su fecha; no las reescribas,
agrega una nueva.

Sommel es un POS para wine bars (comandas, cobro, turnos, checador, inventario).
Inquilino = `WineBar`; el puntero es `User.data.tenant_id` y el rol del bar es
`User.data.app_role` (`bar_admin` | `staff`). El `role` integrado de Base44 es
**solo de la plataforma**. Contratos de las funciones: `docs/entrega-1-contratos.md`
§1-§2 (registros planos, 401 sin sesión, orden de guardias, inquilino siempre
de `ctx`). Plan de cumplimiento: `docs/estandar-plan.md`.

## Deploy (módulo 11), 2026-09-29

**El flujo real de este repo:**

1. Se mergea a `main`.
2. Base44 sincroniza **solo** el código y los esquemas de entidades desde
   GitHub `main`, sin que nadie ejecute nada.
3. Se **publica** con la API de Base44 (quien orquesta; no hay un paso manual
   del operador para un cambio normal).
4. Se **verifica por contenido** lo servido (ver abajo).

Mergear no es publicar, y un paso verde no es prueba. Ningún cambio se da por
cerrado hasta que el paso 4 pasa.

**Verificar por contenido, nunca por hash ni por "unchanged".**
- Frontend: buscar en el bundle servido de `https://sommel.acaciaco.com.mx` una
  cadena que solo exista en el código nuevo:

      MAIN=$(curl -s https://sommel.acaciaco.com.mx | grep -oE '/assets/index-[A-Za-z0-9_-]+\.js' | head -1)
      curl -s "https://sommel.acaciaco.com.mx$MAIN" | grep -c "<cadena nueva>"

- Funciones: llamar una acción que solo existe en el código nuevo. Si responde
  `unknown action`, el código viejo sigue sirviéndose, aunque el repo diga otra
  cosa. (Para `acaciaControl` sin secretos la respuesta correcta es 503
  `bridge_not_configured`; un 404 o `unknown action` significa que no se publicó.)
- Esquemas: releer con `list_entity_schemas` y comparar reglas y descripciones
  con `base44/entities/*.jsonc`. Que el archivo esté bien no prueba que el
  backend lo tenga (la deriva de RLS de StockFlow del 2026-09-07 duró dos días
  así).
- Un `git_commit_hash` igual al HEAD de `main` tampoco prueba nada: el árbol
  servido puede ir atrasado.

**Los scripts de `package.json` (`deploy`, `deploy:site`, `deploy:entities`,
`functions:audit`) siguen ahí, pero no son el camino normal.** Son el recurso de
excepción, y con una regla fija: `scripts/base44-deploy.mjs` lee el `appId` de
`base44.app.json` y **rechaza** `--app-id`. Nunca corras
`npx base44 ... --app-id <id>` a mano: la CLI toma el origen del directorio
actual y el destino del id, y nada comprueba que coincidan (incidente del
2026-08-21 en el portafolio, detalle en `acacia-app-standard/docs/incidents.md`).
`deploy:entities` es destructivo y pide escribir `Sommel`.

**Presupuesto de funciones.** Base44 corta en 50; este repo se fija en
`maxFunctions: 40` (`base44.app.json`). `npm run validate:functions` (dentro de
`npm run lint`) cuenta un endpoint por cada `entry.ts`. Hoy: **15 de 40**.
Un directorio en `base44/functions` sin `entry.ts` **nunca** llega a `main`:
Base44 sincroniza todos los directorios. Por eso `account` y `session` (ola 2)
entran a `TARGET_DIRS` junto con su `entry.ts`, no antes. Cada router agrupa acciones en `handlers/`; el mapa está en
`docs/BACKEND_FUNCTION_LIMIT_REORG.md`. Antes de retirar cualquier función:
`npm run functions:audit`.

## Módulo 4 y 14: auditoría de aislamiento multi-tenant, 2026-09-29

Leída contra el **esquema desplegado** (`list_entity_schemas`, app
`6ab41c2a89f592a0eca074d2`), no solo contra los `.jsonc`.

**Entidades.** 19 entidades, 13 con inquilino. El esquema desplegado coincide
con `base44/entities/*.jsonc` en todas las reglas comparadas. Las 13 con
inquilino leen con
`$or[{data.tenant_id: {{user.data.tenant_id}}}, {user_condition:{role:admin}}]`,
con las dos mitades correctas (prefijo `data.`, plantilla `{{user.data.*}}`). No
hay ningún `user_condition` con claves hermanas (el defecto de liuma). Create,
update y delete son `role:admin` (rol de servicio) en todas salvo dos
excepciones deliberadas: `AppSession` (por `created_by_id`) y `SupportTicket`
(el create admite la rama del inquilino, con `tenant_id` fijado por la regla; es
un punto opcional a decidir, no una fuga entre inquilinos). `WineBar.update` es
`$or[role:admin, $and[id == tenant_id, data.app_role == bar_admin]]`, un rol de
inquilino dentro de `$and`, que el módulo 24 permite.

**Lecturas solo-admin, a propósito** (nadie las "arregle"): `Product` (su
`variants[].cost` no se puede bloquear por campo, así que nadie lee `Product`
directo; `catalog.listProducts` redacta el costo), `Attendance` y `StaffPin`
(se sirven por funciones). Ver `docs/locks-audit.md`.

**Funciones.** `requireContext` relee el `User` con `asServiceRole` y deriva de
esa fila `tenantId`, `appRole` e `isPlatform`; el cuerpo de la petición nunca
aporta el inquilino. `loadOwned` compara contra el `tenant_id` **almacenado** y
un registro inexistente y uno ajeno responden igual (404, sin oráculo de
existencia). Toda acción llama `requirePermission`/`hasPermission`, salvo
`importMenu`, que es solo de plataforma y ahora es la **única** ruta marcada
`allowNoTenant` (ver "Ola 1" abajo). `createWineBar` responde 409 a quien ya
tiene inquilino. `processSale` está retirada (410).

**Salidas.** Los destinatarios del corte salen de `WineBar.corte_emails`
almacenado (`shifts/handlers/_shared.ts`); el correo de invitación va a la
dirección que tecleó el `bar_admin` (comportamiento previsto).

**Datos vivos, leídos el 2026-09-29:** 7 `User`, de los cuales solo
`h.josepablo@gmail.com` tiene `role: admin` integrado. Los otros 6 son `user`, en
2 inquilinos reales más un usuario sin bar. Es decir, la separación **no es
latente**: ya hay dos bares.

**No verificado:**
- Una sesión autenticada como usuario restringido de un segundo inquilino
  (cuentas QA `+sommelstaff` y `+sommelnew`) intentando lecturas y escrituras
  crudas del otro inquilino y llamadas a funciones con ids ajenos. Lo esperado
  es lectura vacía, escritura rechazada y 404. **Pendiente de alguien con esas
  credenciales.** La evidencia de esta pasada son las reglas leídas, no
  ejercidas.
- Si el realtime de `OrderItem` (`subscribe`) deja pasar `unit_cost` a un
  navegador sin permiso.
- El estado de Publish de las funciones nuevas (`permissions`, `acaciaControl`):
  las auditorías fueron de solo lectura.

**Regla de repetición.** La auditoría se repite cuando se añade una entidad, una
función o un rol, y se anota aquí con fecha. Faltan por auditar, cuando
existan: `account`, `session`, `purgeStaleSessions` y la función `permissions`
contra el backend real.

## Módulo 24: el rol de un inquilino nunca alcanza a todos, 2026-09-29

Diseño A por construcción. Solo la plataforma tiene `role: admin` integrado.
`User.tenant_id` y `User.app_role` llevan `rls.write: false` y solo los escriben,
como servicio, `createWineBar` y `manageStaff` (invitar, `setRole`, quitar,
`claimInvite`); ninguna función escribe `role: 'admin'`. `npm run
validate:tenant-roles` (idéntico byte a byte a
`shared/tenant-roles/check-tenant-roles.mjs`) pasa y corre en CI. No verificado:
una sesión restringida intentando esas escrituras.

## Módulo 19: bloqueos con su razón y su guardia, 2026-09-29

Inventario completo en `docs/locks-audit.md`. Resumen:

- Cada bloqueo de campo o de entidad lleva su razón en una **descripción de
  esquema que sí se despliega**, no en un comentario `//` (los comentarios no
  llegan al backend). Cada una dice qué operación gobierna, quién la usa
  legítimamente y qué se abre si se quita ("Si se ...").
- `scripts/validate-locks.mjs` + `scripts/lib/locks-rules.mjs` (23 entradas en el
  manifiesto) fallan si un bloqueo falta o se afloja, o si su descripción tiene
  menos de 200 caracteres o no nombra "Módulo 19", la operación y el "Si se ...".
  Un bloqueo nuevo se añade al manifiesto a propósito.
- `base44/tests/locks_test.ts` (8 pruebas) usa el mismo manifiesto. **Lee los
  archivos de entidades, así que CI debe correr**
  `deno test --allow-env --allow-read=base44/entities base44/tests/`. Con
  `--allow-env` solo esas 8 fallan. CI ya corre la forma con `--allow-read`
  (más `base44/functions/acaciaSign.test.ts`).
- Regla para quien depure un síntoma ("los productos no cargan", "no me deja
  guardar"): **nombra primero el mecanismo** (qué regla, qué campo, qué
  operación) y **no aflojes un bloqueo para arreglar un síntoma** que se
  resuelve en otra parte (la lectura redactada, la función, la UI). Si el
  síntoma persiste tras devolver el bloqueo, era otra cosa. Comprueba las dos
  superficies: el `.jsonc` del repo y el esquema desplegado.
- `super_admin` **sigue** en el enum de `User.app_role`. No se quitó porque no
  se pudo confirmar desde aquí que ningún usuario vivo lo tenga (la lectura viva
  del 2026-09-29 no mostró ninguno). Un operador puede quitarlo tras releer las
  filas.
- No hay script que compare el esquema desplegado con el repo (`check-lock-drift`
  no existe). Esa comparación se hizo a mano el 2026-09-29 y se repite con
  `list_entity_schemas` tras cualquier cambio de entidad.

## Módulo 13: smoke contra el sitio DESPLEGADO, 2026-09-29

`tests/smoke/smoke.spec.js` es la suite compartida del portafolio (idéntica byte
a byte; fuente en `acacia-app-standard/shared/smoke/`) y
`tests/smoke/smoke.config.js` es lo propio de Sommel: URL
`https://sommel.acaciaco.com.mx`, título `/Sommel/`, tema `kind: 'class'` con
raíz `[data-theme-switcher]`, y rutas públicas `./`, `./login`, `./register`,
`./forgot-password`, `./reset-password`, `./no-such-page`.
`.github/workflows/smoke.yml` la corre por `workflow_dispatch` (justo después de
publicar) y con un cron diario. No corre en el pipeline de push/PR ni desde el
sandbox de desarrollo (el proxy no alcanza el dominio).

**Alcance real:** solo cubre rutas **públicas**. Que pase en verde no dice nada
de las pantallas autenticadas (Mesas, Orden, Turno...). Esas se revisan a mano.

**Estado (2026-09-29):** `@playwright/test`, el script `test:smoke` y las
entradas de `.gitignore` (`test-results/`, `playwright-report/`) ya están
cableados. La suite **no se ha corrido contra el sitio publicado** (el proxy del
sandbox no alcanza el dominio); solo se validó que la config carga.

## Ola 1 del estándar, lo que se construyó (2026-09-29)

Todo lo de esta sección es código **en el repo**; nada está publicado ni
verificado en vivo hasta que se siga el flujo de deploy de arriba.

**Login (módulo 10).** `AuthLayout.jsx` es pantalla dividida (panel de marca
`hidden lg:block`), con el logo **SOMMEL** de `Layout.jsx`, nunca el de un
inquilino. Todas las pantallas de auth muestran `soporte@acaciaco.com.mx` y
`https://acaciaco.com.mx` (no `/apps/sommel`: da 404 hasta que exista la página
del módulo 9). `AuthContext.navigateToLogin()` manda a `/login?returnTo=...` sin
bucle y ya no usa el login alojado de Base44. `/login`, `/register`,
`/forgot-password` y `/reset-password` se pintan **antes** del spinner y del
retorno por `authError`. Los errores pasan por `src/lib/authErrors.js`
(credenciales, correo sin verificar, 429, red, 5xx). No verificado: un login
real, Google, un 429 real o una respuesta real de correo sin verificar (esa
detección es por regex sobre el mensaje).

**Tema (módulos 12 y 23).** `ThemeSwitcher.jsx` es copia exacta del estándar; no
se edita aquí. Lo propio: `src/lib/ThemeContext.jsx` (clave de almacenamiento
`sommel-theme`, se conserva para no borrar la preferencia de los usuarios) y
`src/lib/useThemeMode.js`. Se monta en `src/main.jsx`, fuera del router, así que
sale también en el login y el 404. `useTheme.js` se borró. El script pre-montaje
de `index.html` y el proveedor caen igual a `system` si el almacenamiento está
bloqueado. `src/index.css` trae `--theme-switcher-bottom/right`, y como la barra
fija de `Orden.jsx` existe a todos los anchos, `FixedBottomBar` fija
`data-bottom-bar` y `--bottom-bar-h` en `<html>` mientras está montada para
subir el selector. El scroll del `<nav>` de `Layout` se guarda en
`sessionStorage`. Los chips de estado llevan variante `dark:`.

**Aviso de licencia (módulo 1/7/10).** `LicenseBanner` (sobre el `Outlet`) avisa
de `suspended`, `view_only` y días de prueba, con enlace a soporte. **Nunca
bloquea el login ni la navegación**: un bar suspendido tiene que poder entrar a
leer el mensaje. Si la lectura falla, no pinta nada. Lo lee con `settings.billing`, que solo
exige ser miembro del bar (cualquier rol) y devuelve únicamente `billing_status`
y `trial_end_at`. `settings.update` no los escribe: no están en
`EDITABLE_FIELDS`. No verificado: contra un `WineBar` real ni la variante de
prueba (solo `view_only` se vio en pantalla, con respuestas simuladas).

**Permisos del servidor (módulo 3).** Función `permissions` (`getProfile`,
`upsertProfile`): exige `bar_admin` o plataforma; `upsertProfile` pasa por
`requireWritable`, acepta solo claves reales del registro con valores booleanos
(una mala rechaza toda la petición), reemplaza el mapa completo y solo admite el
rol `staff` (`bar_admin` siempre puede, un override no haría nada). El
inquilino sale de `ctx`. `permissionRegistry.js` gana `Ajustes:exportar`,
`Equipo:invitar`, `Equipo:cambiar_rol`, `Equipo:quitar` (staff: false) y
`PERMISSION_LABELS`; una prueba falla si una clave no tiene etiqueta. Esas
cuatro claves **solo existen en el registro**: `manageStaff` sigue exigiendo
`bar_admin` y no las consulta. Las etiquetas en español son redacción provisional
para la pantalla de Permisos (ola 2, H1).

**Guardias (módulo 14).** En la plantilla `_guard.ts`, `allowNoTenant` ahora es
`false` por defecto; una ruta lo pide con `allowNoTenant(route)` y solo lo hace
`catalog.importMenu`. Antes la condición dejaba pasar a un admin de plataforma
sin bar en **cualquier** ruta. El router busca la acción con `hasOwnProperty`
(una acción `constructor` ya no es ruta). Las copias por función se regeneran
con `npm run generate:guards`; **nunca se editan a mano** (`check:guards` falla
si derivan). No verificado: `handle()` en sí (importa `npm:@base44/sdk`, bloqueado
en el sandbox); se probó la función pura `tenantAccessDenied()` y se leyó el
router.

**manageStaff.** Tras `setRole` o `removeMember` vuelve a contar los admins y
revierte con 409 `last_admin` si no queda ninguno; solo actúa si la persona
afectada era `bar_admin` antes de la escritura (un bar que ya tenía cero admins
puede seguir quitando personal). `revokeInvite` pasa por el gate de facturación
(402 `read_only`).

**Puente con Mission Control (módulos 5, 15, 16).** `acaciaControl` verifica con
la llave derivada por app (`HMAC-SHA256(maestro, "acacia.app.v1." + slug)`);
`_acaciaSign.ts` es copia exacta del estándar con `ACCEPT_LEGACY_MASTER = false`,
y `base44/functions/acaciaSign.test.ts` fija el mismo vector que la mitad Node de
Mission Control. **Falla cerrado:** sin `INGEST_HMAC_SECRET` o sin
`ACACIA_APP_SLUG`, toda llamada responde 503 `bridge_not_configured` antes de
leer o escribir nada; después van 400 (cuerpo mal formado), 401 (firma mala,
`ts` viejo o firma de otra app). Acciones: `ping` (lectura real de `WineBar`;
503 si falla), `licenses.list`, `license.get`, `tenants`, `license.set` (solo
`billing_status`, `plan`, `trial_end_at`, `current_period_end`; campos
desconocidos o un estado fuera de `trial|active|view_only|suspended` dan 400),
`tickets.list`, `usage`/`usage.summary`, `usage.byTenant`, `sessions.list` y
`sessions.revoke`. **Más estricto que el de StockFlow:** cada acción está atada a
una entidad; no hay "entidad y campo a elección del firmante". Faltan a
propósito (responden 400 `unknown action`): `tickets.update`, `tickets.thread`,
`emails.*`, `tenants.contacts`; hasta que existan, las respuestas a tickets y los
correos de renovación de Mission Control fallarán para Sommel.
`sessions.revoke` escribe solo `revoked_at` y `revoked_by` (la entidad aún no
tiene `status`; H5 la amplía sin quitar esos campos).
`createWineBar` responde 401 (español) sin sesión y 400 con JSON inválido en vez
de 500; `computeTrialEnd` (30 días) y `buildNewBar` (estado `trial`) están
extraídos y probados. Un cuerpo firmado con la llave de otra app, y uno firmado
con el maestro sin derivar, **no** verifican.
Secretos: `docs/secrets.md`. **No verificado:** la función publicada contra
Mission Control (necesita los secretos puestos y `sommel` registrado allá), ni
`createClientFromRequest`/entidades reales en `entry.ts` (las pruebas cubren la
lógica pura y la puerta de firma).

**Comprobaciones de la ola 1:** el árbol integrado corre con el comando exacto
de CI: 374 pasaron, 0 fallaron. `lint`, `build`,
`validate:rls` (19/13), `validate:tenant-roles` y `check:guards` (26 archivos, sin
deriva) pasaron por paquete, con `validate:functions` en 15 de 40.

## Comprobaciones que hay que correr

    npm run lint                   # eslint + validate:functions + validate:locks + check:bridge + check:auth-me
    npm run build
    npm run validate:rls           # 19 entidades, 13 con inquilino
    npm run validate:tenant-roles
    npm run check:guards           # copias de _guard*.ts sin deriva
    npm run validate:locks         # ya incluido en lint; se puede correr suelto
    deno test --allow-env --allow-read=base44/entities base44/tests/ base44/functions/acaciaSign.test.ts
    deno lint base44/functions base44/tests

`deno.land` y `jsr.io` están bloqueados en el sandbox de desarrollo: las pruebas
de Deno de este repo **no importan nada externo**, a propósito, para que corran
donde se escriben. El binario de Deno se baja de la release de GitHub.
`npm:@base44/sdk` tampoco se resuelve, por eso las lógicas puras viven en
archivos `_*_logic.ts` sin imports.

## Convenciones

- Registros **planos** en las respuestas, 401 sin sesión, tenant desde `ctx`
  (`docs/entrega-1-contratos.md`).
- Texto de usuario en español, **sin rayas largas (—)**; comentarios e
  identificadores en inglés.
- Solo tokens de tema (`bg-background`, `text-muted-foreground`, ...), nunca
  colores fijos; revisar a 390, tablet (834) y 1440, claro y oscuro.
- Toda escritura pasa por una Safe function; el cliente no escribe entidades.
- El costo nunca sale al navegador de quien no tiene `Menú:ver_costos`.
- Un color, clave o bloqueo nuevo se registra donde corresponde (tokens en
  `index.css`, claves en `permissionRegistry.js`, bloqueos en el manifiesto de
  `locks-rules.mjs`).

## Pendiente de terceros (2026-09-29)

- **Secretos** en Base44 (`INGEST_HMAC_SECRET`, `ACACIA_APP_SLUG=sommel`, ...):
  los pone el operador y luego se releen. Ver `docs/secrets.md`.
- **Mission Control**: fila `apps` de `sommel`, migración, catálogos. El orden
  correcto: publicar `acaciaControl`, poner y releer secretos, y **después**
  registrar la fila (si no, cada sincronización registra errores de Sommel).
- **Página en acaciaco-site** (módulo 9): mientras no exista, no enlaces a
  `/apps/sommel`.
- **Cuenta cruzada QA** para el módulo 14 y revisión manual del selector de tema
  en las pantallas autenticadas.
