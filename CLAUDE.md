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
`npm run lint`) cuenta un endpoint por cada `entry.ts`. Hoy: **19 de 40** (ola 2: `account`, `session`, `purgeStaleSessions`; 2026-09-30: `support`).
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
deriva) pasaron por paquete, con `validate:functions` en 15 de 40 (conteo de la ola 1, ya superado: ver arriba).

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

## Ola 2 del estándar (2026-09-29)

Código **en el repo**; nada publicado ni verificado en vivo. Se publica con el
flujo de "Deploy (módulo 11)" y se verifica por contenido.

**Decisiones de José (2026-09-29).** (1) El panel de plataforma de Sommel **sí**
puede cambiar la licencia: `settings.platformSetLicense`, solo plataforma, con
bitácora en `WineBar.license_audit` (quién, cuándo, antes y después, nota; 100
entradas). (2) Al dar de baja un bar **se conservan** pedidos, pagos, turnos,
movimientos y asistencia (CFF art. 30, 5 años): `account.deleteBar` archiva
(`archived_at` + `suspended`) y desliga usuarios, PINs e invitaciones. (3)
Sommel va en la lista pública de acaciaco.com.mx (`apps/sommel.html` en
`acaciaco-site`, con insignia "En desarrollo" hasta publicarse; no enlazar
`/apps/sommel` antes). (4) Cualquiera puede crear su bar de prueba
(`createWineBar`, 30 días).

**Construido.**
- Módulo 3, `/permisos` (solo `bar_admin`/plataforma): matriz del rol `staff`
  con `permissions.getProfile/upsertProfile`; guardados en cola con el mapa
  completo. `PermissionContext` lee los overrides una vez: el staff los ve en su
  siguiente carga.
- Módulo 7, `account` (`exportData`, `deleteMyAccount`, `delegateBar`,
  `deleteBar`) más `LicenseCard`, `ActiveSessions` y `DangerZone` en Ajustes.
  `deleteMyAccount`/`deleteBar` no pasan por `requireWritable` a propósito.
- Módulo 8, `/soporte`: `SupportTicket` se crea desde el cliente (la regla de
  create admite la rama del inquilino) y se avisa a Mission Control con
  `ticket-pull` sin firma. Ajustes enlaza a `/soporte` para pedir la baja.
- Módulos 6 y 21, `/about`, manual (`manualContent.js`), `AppUpdateBanner` y
  `npm run release` (único escritor de `appConfig.js`/`package.json`;
  `check:version` va dentro de `lint`). Secretos opcionales:
  `ANTHROPIC_API_KEY_SOMMEL`, `RELEASE_PR_PAT`.
- Módulo 20, funciones `session` y `purgeStaleSessions`, hooks y diálogos en
  `Layout`. `session` **no** usa `_guard.ts` (es por usuario; un usuario sin bar
  se leería como sesión revocada). `AppSession` create/update pasó a solo
  `role:admin` (no era puramente aditivo). `purgeStaleSessions` responde 503 sin
  `CRON_SECRET`: hay que ponerlo y programarla con bearer.
- Plataforma: `SuperAdmin.jsx` reescrito sobre `settings.platformListBars/
  platformSetLicense` (`allowNoTenant`, comprueban `isPlatform`); importes de
  `Order.total` en centavos.
- `src/lib/rbac.js` es el único mapeo de roles del cliente.
- Bloqueos: `WineBar.archived_at` y `license_audit` entran al manifiesto (25
  entradas, `docs/locks-audit.md`).

**Comprobaciones (árbol integrado):** `lint` (incluye validate:functions 18/40,
locks, bridge, auth-me, version), `build`, `validate:rls` (19/13),
`validate:tenant-roles`, `check:guards` (28), `deno test` 417/0, `deno lint`
limpio.

**No verificado:** ningún `entry.ts` (importan `npm:@base44/sdk`); nada contra
Base44 ni Mission Control en vivo; sesiones, purga de 48 h, `User.delete` como
servicio; pantallas a 390/834/1440 en claro y oscuro; que `archived_at`,
`license_audit` y los campos de `AppSession` lleguen al esquema desplegado
(releer con `list_entity_schemas`); `acaciaControl` aún no escribe `license_audit`
ni `status:'revoked'`, ni oculta bares con `archived_at`, y sigue sin
`tickets.update/thread`; el manual está sin revisión humana.

## Verificación de correo por código y auditoría de unión a un bar (2026-09-30)

**A. Verificación de correo (OTP), código en el repo.**
- `src/components/VerifyEmailStep.jsx` es el único paso de código, compartido por
  Registro y Login: `verifyOtp({email, otpCode})`, `resendOtp`, errores por
  `friendlyAuthError(..., "verify")`. Tras un código bueno usa el token que
  devuelve `verifyOtp`; si no llega token intenta `loginViaEmailPassword` con la
  contraseña que ya tiene; si eso falla manda a `/login` con aviso. Antes, sin
  token, Registro redirigía a la app y rebotaba al login sin explicación.
- Login: si `loginViaEmailPassword` falla porque el correo nunca se verificó
  (`needsEmailVerification` en `src/lib/authErrors.js`, regex sobre el mensaje de
  Base44), reenvía el código y abre el paso de código. Cualquier otro error
  conserva su mensaje. `friendlyAuthError` usa el mismo detector.
- Pruebas: `base44/tests/auth_errors_test.ts`.

**B. Auditoría del modelo de bar, roles y unión (sin cambios de esquema).**
- **No existe código de unión en Sommel** (grep de `join_code`/`invite_code`/
  código de bar en `src`, `base44`, `docs`: nada). La única forma de entrar a un
  bar existente es la invitación que crea un `bar_admin` (`manageStaff.invite`),
  que cuenta como pre aprobada. Por eso no se construyó flujo de solicitud
  pendiente ni pantalla de aprobación: no hay acceso instantáneo por código que
  cambiar. Si algún día se añade un código, debe nacer como solicitud pendiente
  (sin datos, `bar_admin` aprueba y elige rol de una lista blanca desde Equipo).
- Ya cumplían: `createWineBar` deja al creador `bar_admin` de su bar y responde
  409 a quien ya tiene bar; `User.tenant_id`/`app_role` son `rls.write:false` y
  solo los escriben `createWineBar` y `manageStaff` como servicio; ninguna
  función escribe `role:'admin'` (`validate:tenant-roles`); `StaffInvite` es solo
  servicio; `claimInvite` busca por el correo ALMACENADO del usuario releído con
  `asServiceRole`, nunca por el cuerpo; el 409 `already_in_a_bar` de `invite`
  impide mover a alguien de otro bar.
- Endurecido en `manageStaff.claimInvite`: el rol sale de la invitación guardada
  por lista blanca (`roleFromInvite`: `bar_admin` o `staff`, cualquier otra cosa
  degrada a `staff`, nunca rol de plataforma) y una invitación a un bar inexistente
  o archivado (`isBarClaimable`, `archived_at`) se revoca y no asigna a nadie.
  Pruebas en `base44/tests/staff_invites_logic_test.ts`.
- Un `WineBar` creado por `createWineBar` nace con `billing_status: trial`.

**Comprobaciones corridas:** `npm run lint`, `build`, `validate:rls` (19/13),
`validate:tenant-roles`, `check:guards`, `deno test` (427/0) y `deno lint`.

**NO verificado:** un registro y un login reales con el código de Base44 (el
texto exacto del error de "correo sin verificar" se detecta por regex y no se vio
contra el backend); que `verifyOtp` devuelva `access_token` en producción (los
dos caminos, con y sin token, están cubiertos por código, no ejercidos); el
`claimInvite` endurecido contra Base44 real (`entry.ts` importa `npm:@base44/sdk`,
no corre en el sandbox); pantallas a 390/834/1440.

**Desplegar, en este orden** (sin cambio de esquema ni de entidades):
1. Mergear a `main`.
2. Publicar funciones (`manageStaff` cambió en `entry.ts` y `_invite_logic.ts`) y
   el sitio.
3. Verificar por contenido: en el bundle servido de `sommel.acaciaco.com.mx`
   buscar "Reenviar código"; y registrar una cuenta de prueba con correo y
   contraseña para ver el paso de código. No hay forma de comprobar `manageStaff`
   por "unknown action", porque no se añadió acción: se comprueba invitando a una
   cuenta de prueba y reclamándola.

### Seguimiento de la revisión de Codex (2026-09-30)

`needsEmailVerification` (`src/lib/authErrors.js`) ya no se detiene en el primer
mensaje no vacío: revisa `message`, `data.message/detail`, `response.data.message/
detail/error` y un cuerpo en texto, así que el "Request failed with status code 403"
genérico de axios no oculta el texto real del backend (prueba nueva en
`auth_errors_test.ts`). `Register.jsx` conserva el `returnTo` validado
(`safeReturnTo`) al caer a `/login` tras verificar sin sesión. Verificado: `lint`,
`build`, `validate:rls`, `validate:tenant-roles`, `check:guards` y `deno test` con el
comando de CI (428/0). No verificado en vivo contra Base44.

## Puente: `tickets.update`, `tenants.contacts` y `emails.sendFollowup` (2026-09-30)

Tres acciones nuevas en `acaciaControl`. La lógica que decide vive en
`_bridge_logic.ts` y la fijan pruebas en `base44/tests/bridge_test.ts`.

- **`tickets.update`**: solo cambia `status`, y solo a `abierto`, `en_proceso` o
  `cerrado`. Cualquier otro campo, un estado de otra app (`resolved`) o una
  respuesta (`message`, `appendItem`) da 400: Sommel no tiene hilo donde el bar
  la leería. Atada a `SupportTicket`; 404 si el ticket no existe.
- **`tenants.contacts`**: un contacto por bar vivo, su dueño si sigue siendo
  `bar_admin`, si no el `bar_admin` más antiguo. El staff nunca, y un bar con
  `archived_at` no sale. Se ignora el `recipient` que manda Mission Control:
  quién habla por un bar lo decide Sommel.
- **`emails.sendFollowup`**: una firma válida no basta para mandar correo a
  cualquiera. Con `internal: true` solo a direcciones de ACACIA (dominio
  `acaciaco.com.mx`, `PLATFORM_OWNER_EMAIL`, `APP_SUPPORT_EMAIL`); sin él, solo a
  un contacto de `tenants.contacts`. Lo demás es 403. Asunto sin saltos de línea
  y HTML de 200 KB como máximo. El dueño recibe copia de lo que va a un bar.

Siguen sin existir, a propósito: `tickets.thread` (no hay hilo) y `emails.status`
(no hay entidad de bitácora de correos).

**Efecto inmediato al publicar:** los avisos internos de Mission Control (ticket
nuevo, bar nuevo) empiezan a llegar. Los correos a bares (renovación, uso, ciclo
de vida) **no**: siguen apagados mientras `sommel` no esté en `messaging.js` de
Mission Control, y encenderlos es una decisión aparte.

**Verificado:** `lint`, `build`, `validate:rls` (19/13), `check:guards` y
`deno test` con el comando de CI (437/0), `deno lint` limpio. **No verificado:**
`entry.ts` contra Base44 real (importa `npm:@base44/sdk`), que `SendEmail` acepte
`from_name` en esta app (StockFlow lo usa) y un envío real.

## Conversación en los tickets de soporte (2026-09-30)

Decisión de José: ACACIA responde desde Mission Control, el bar contesta en el
mismo ticket y al bar le llega un correo cuando ACACIA responde.

- **`SupportTicket` gana `responses[]`** (`author_role` `acacia` | `bar`,
  `author_name`, `author_email`, `body`, `created_at`) y `last_activity_at`. El
  mensaje original sigue en `body`. Las reglas RLS no cambian: `update` ya era
  solo servicio, así que nadie escribe la conversación desde el navegador.
- **ACACIA responde por el puente**: `acaciaControl` `tickets.update` acepta
  `appendField: 'responses'` con un `appendItem` de `author_role: 'acacia'`
  (nunca `bar`), lo agrega a la lista **viva** que relee justo antes de escribir
  y usa el reloj del servidor. Luego manda al contacto del bar (su dueño, o el
  `bar_admin` más antiguo) el correo de `_reply_email.ts`, con el layout
  compartido (`EMAIL_TARGET_DIRS` gana `acaciaControl`). Si el correo falla, la
  respuesta ya quedó guardada y la acción responde `email_sent: false`.
- **El bar contesta con la función nueva `support`** (`replyTicket`, 19 de 40
  endpoints). `loadOwned` ata el ticket al bar del que llama (un id ajeno es
  404). Sin freno de facturación ni clave de permiso, a propósito: un bar
  suspendido tiene que poder hablar con soporte, y quien puede abrir un ticket
  puede seguirlo. Contestar un ticket `cerrado` lo reabre. Después el cliente
  avisa a Mission Control con `ticket-pull` para que su bandeja lo vea.
- **Límites compartidos**: 200 mensajes por ticket y 5,000 caracteres por
  mensaje en los dos lados; `support_reply_test.ts` falla si se separan.
- **Pantalla**: en Soporte cada ticket se abre y muestra la conversación y la
  caja para responder.

**Orden de despliegue:** este PR primero (Base44 sincroniza el esquema al
mergear; luego publicar), y después el de Mission Control que configura Sommel
con conversación en línea. Con Mission Control primero, responder desde el panel
daría 400 hasta que esto se publique; no rompe nada más.

**Verificado:** `lint` (19/40), `build`, `validate:rls` (19/13),
`validate:tenant-roles`, `check:guards` (31), `deno test` con el comando de CI
(445/0) y `deno lint`. La pantalla de Soporte se vio a 390 px con el build local
contra el backend real (sin errores de página ni scroll horizontal).
**No verificado:** los `entry.ts` contra Base44 real (importan
`npm:@base44/sdk`), una respuesta real en ninguno de los dos sentidos y el correo
real al bar. Se prueban tras publicar, con el ticket de prueba de Sommel QA.

## Impresión directa por USB, cajón y checador por usuario (2026-10-06)

**Impresión (PR #23).** La estación ya no depende de `window.print()` ni de
`--kiosk-printing`: Chrome y Edge hablan con la impresora de tickets por
WebUSB y le mandan ESC/POS (`src/components/printing/usbPrinter.js` y
`escpos.js`). Se elige la impresora una vez en Impresión ("Conectar
impresora"); Chrome guarda el permiso y se reconecta sola al recargar o al
volver a enchufar. Sin impresora USB, o en Safari/iPad (no tienen WebUSB),
sigue el cuadro de impresión del navegador como respaldo.
- Código de página 850 (`ESC t 2`) para acentos y ñ; UTF-8 sale como basura.
- El área de impresión queda fija en 384 puntos: las líneas del servidor son
  de 32 columnas (58 mm) y así salen iguales en 58 y en 80 mm. "Grande" es
  solo doble alto, para no partir las 32 columnas.
- Una falla por USB deja el trabajo `fallido`. Con `window.print()` quedaba
  `impreso` aunque no saliera papel.
- **Cajón:** `PrintJob.open_drawer` lo pone `payments.requestTicket` solo si
  la cuenta tiene un pago vivo con método `is_cash`. Una reimpresión nunca lo
  abre (la estación lo ignora si hay `reprint_of`). "Abrir cajón" lo abre a
  mano y **no deja registro**: si algún día hace falta auditarlo, eso es una
  acción del servidor, no un botón.
- Verificado en hardware: EC Line EC-PM-80330 (80 mm, ESC/POS) en macOS,
  sin driver: imprime, corta y abre el cajón; tarjeta no lo abre;
  reimpresión no lo abre.
- **No verificado:** Windows con un driver del fabricante instalado (puede
  retener la impresora; el error lo dice) y la impresora de Alby.

**Renglón duplicado en Orden (PR #24).** Un producto recién agregado llega por
dos caminos: la respuesta de `orders.addItems` y el evento en vivo de
`OrderItem.subscribe`. `handleAddConfirm` agregaba la respuesta a ciegas y,
si el evento llegaba antes, el renglón salía dos veces (el total del servidor
siempre estuvo bien). Regla: **todo lo que llegue por dos caminos se agrega
por id** (`upsertById` en `orders/helpers.js`). Las demás pantallas en vivo
(Mesas, Estación, Inventario, Impresión) ya lo hacían; se revisó todo `src/`.

**Quién inició sesión.** La barra lateral muestra siempre nombre (o correo) y
rol (`roleLabel` en `src/lib/rbac.js`) arriba de "Cerrar sesión", y la barra
mide la pantalla (`sticky h-screen`): lo que hace scroll es el menú, no el
bloque de sesión.

**Checador por usuario.** Con `Asistencia:ver_equipo` (admins por defecto) es
la tablet compartida: se ve todo el equipo y se checa a cualquiera con su PIN.
Sin ese permiso `attendance.roster` solo devuelve a quien inició sesión, la
pantalla abre directo su teclado, y `attendance.punch` responde 403
`not_self` si se intenta checar a otra persona aunque se sepa su PIN. Antes
cualquier sesión de personal veía y podía checar a todos.

**La impresora imprime desde cualquier pantalla.** Un ticket pedido desde
Cobro se quedaba `pendiente` hasta que alguien abría Impresión: solo esa
página tenía la estación. Ahora hay una sola estación para toda la app
(`PrintStationProvider` en `Layout`; contexto, proveedor y hook en tres
archivos, igual que `lib/auth/`). Reglas:
- Con impresora USB en este equipo: trabaja desde cualquier pantalla, y la
  impresión automática arranca **encendida** salvo que alguien la apague en
  este equipo (`readAutoPref` devuelve `null` si nadie eligió).
- Sin impresora USB: solo con Impresión abierta, como antes, porque
  `window.print()` abriría un cuadro en medio de un cobro.
- Un Web Lock (`sommel-print-station`) evita que dos pestañas del mismo
  equipo impriman el mismo trabajo: comparten `device_id` y el reclamo del
  servidor no las distingue.
- **Pendiente:** no hay ruteo por tipo. Dos equipos con impresora y la
  automática encendida se reparten cualquier trabajo (cocina, barra, ticket,
  corte). Con una sola impresora no importa; con dos, hace falta asignar
  tipos por estación.

**Propinas rápidas.** `TipDialog` ofrece 10 / 15 / 20 % (`QUICK_TIP_PCTS`) con
su monto, y un toque guarda. Son para quien cobra cuando el cliente ya dijo
cuánto deja: nada se sugiere ni se imprime al cliente. El contrato decía "sin
porcentaje sugerido" y se actualizó (`docs/entrega-2-contratos.md`). El monto
del botón es solo vista previa; el servidor calcula la propina.

## Vista combinada "Cocina y barra" (2026-10-06)

`/estacion/todo` muestra las dos colas en una sola pantalla, para bares donde
la misma barra prepara las tapas. Se adelantó antes de la fase 2 del modo
terminal (`docs/modo-terminal-diseno.md`) y usa el permiso de hoy,
`Estaciones:operar`; la división en `Estaciones:cocina`/`Estaciones:barra` es de
la fase 3.
- Cada renglón lleva su etiqueta Cocina/Barra. El calor de la comanda se mide
  por estación contra la meta de **esa** estación (`ticketHeat` en
  `stationHelpers.js`) y la comanda muestra la peor; una estación con todo
  cancelado no calienta la comanda.
- Filtro rápido Todo / Cocina / Barra, recordado por equipo
  (`sommel-station-filter`).
- Una ruta desconocida no muestra todas las estaciones: `stationsForView`
  devuelve `[]`.
- Pruebas: `base44/tests/station_view_test.ts`. Vista revisada con el build
  local contra el backend real, a 390 y 1440 px, en claro y en oscuro.
- No verificado: el tiempo real con dos pantallas abiertas a la vez.
