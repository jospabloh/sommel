# Plan de implementación: Sommel frente al estándar ACACIA

## 1. Estado por módulo

| Mód. | Estado | En una línea |
|---|---|---|
| 1 Ciclo de licencia | parcial | Los campos de licencia están bloqueados y hay un 402 `read_only`. Falta el puente con MC, falta el aviso de nuevo inquilino, la UI no avisa de view_only/suspended, y `SuperAdmin.jsx` escribe `billing_status` desde el navegador. |
| 2 Usuarios y roles | hecho | No hay un archivo `rbac.js`. `super_admin` no se usa. Falta volver a leer el conteo de admins después de degradar a uno. |
| 3 Permisos granulares | parcial | El registro y `requirePermission` funcionan. No existe la función `permissions`: nadie escribe `PermissionProfile` (hay 0 filas). Tampoco hay pantalla de Permisos. |
| 4 RLS | hecho | El esquema desplegado coincide con el repo en las 19 entidades. Falta anotar la auditoría con fecha. |
| 5 Salud | falta | No existe `acaciaControl`, así que no hay `ping`. |
| 6 Changelog y versión | falta | No hay `appConfig.js` ni script `release`, y `package.json` sigue en 0.0.0. |
| 7 Cuenta y zona de peligro | parcial | Perfil y equipo existen. Falta exportar datos, borrar mi cuenta, borrar el bar, ceder la propiedad y una tarjeta de licencia. |
| 8 Soporte → MC | falta | La entidad existe, pero no hay pantalla, ni aviso a MC, ni registro en MC. |
| 9 Página en acaciaco-site | falta | `/apps/sommel` da 404. Se pospuso a propósito a la fase 4. |
| **10 Login** | **parcial** | `AuthLayout` es una tarjeta sola, no la pantalla dividida del estándar. La sesión caducada manda al login alojado de Base44. No hay enlaces a soporte ni al sitio, los errores salen crudos y `UserNotRegisteredError` está en inglés y con colores fijos. |
| 11 Deploy y presupuesto | parcial | Los scripts son idénticos a los de StockFlow (13/40 funciones). `README.md` y `AGENTS.md` contradicen el flujo, y no se documenta el paso de Publish. |
| 12 Tema | parcial | Falta el `ThemeSwitcher` de esquina (hoy es un botón cíclico en el sidebar) y no aparece en `/login`. Los chips no tienen variante oscura. `sonner` no sigue el tema elegido. El script pre-montaje y el hook no caen al mismo valor cuando el almacenamiento está bloqueado. |
| 13 Smoke | falta | No hay `tests/smoke`, ni `smoke.yml`, ni `test:smoke`. |
| 14 Aislamiento | parcial | El aislamiento está bien, pero no hay auditoría escrita con fecha. `handle()` usa `allowNoTenant: true` por defecto. |
| 15 Puente | falta | No hay `_acaciaSign.ts`, ni `acaciaControl`, ni prueba del vector. |
| 16 Secretos | falta | La lista de secretos en Base44 está vacía `{}` y no hay inventario escrito. |
| 17 Lado MC | falta | "sommel" no aparece en ningún archivo de Mission Control. |
| 19 Guardia de cada arreglo | parcial | Los bloqueos están vivos, pero varias descripciones no explican su razón y ningún CI fija los bloqueos. |
| 20 Sesiones | falta | Solo existe la entidad `AppSession`. No hay ninguna de las tres capas. |
| 21 Acerca de | falta | No hay pantalla, ni manual, ni versión, ni contacto. Depende del 6. |
| 22 Campo del servidor | hecho | No hay guardia de CI. `createWineBar` responde 500 en vez de 401 cuando no hay sesión. |
| 23 Navegación tras recargar | parcial | El scroll del `<nav>` no se guarda en `sessionStorage`. |
| 24 Rol de inquilino | hecho | `plan-tecnico.md` está desactualizado: cuenta 1 usuario y usa `subscription_status`. |

## 2. Paquetes que un agente cierra solo

Las reglas son tres. Dentro de una ola, ningún archivo aparece en dos paquetes. Una ola empieza cuando la anterior está mergeada. Se corre `npm run lint && npm run build && npm run validate:rls && npm run validate:tenant-roles && npm run check:guards` y `deno test --allow-env` (solo los archivos que no importan de `deno.land`) en cada paquete.

### Ola 1 (en paralelo)

**A. Login (módulo 10), va primero. Tamaño M.**
- **Cambios:**
  - `AuthLayout.jsx` se adapta desde `shared/auth/AuthLayout.example.jsx`: formulario a la izquierda con el logo; panel de marca `hidden lg:block` con eyebrow, titular y descripción; lema al pie. Los textos van en español para un POS de wine bar. Se usa el logo de `Layout.jsx:19`, solo tokens, y se conservan los props actuales para que `OAuthConsent` siga completo.
  - `AuthContext.navigateToLogin()` pasa a `/login?returnTo=…` sin bucle, y deja de usar `redirectToLogin`.
  - En `App.jsx`, `/login`, `/register`, `/forgot-password` y `/reset-password` se renderizan **antes** del return temprano por `authError`, y el `navigateToLogin()` del return pasa a `<Navigate to="/login" replace/>`.
  - `Login.jsx` traduce los errores a español: credenciales, correo sin verificar, 429 y red. Suma enlaces a `soporte@acaciaco.com.mx` y al sitio.
  - `UserNotRegisteredError.jsx` se reescribe en español sobre `AuthLayout` con tokens.
  - Los spinners de `App.jsx` y `ProtectedRoute.jsx` pasan a `border-border`/`border-t-primary`.
- **Archivos:** `src/components/AuthLayout.jsx`, `src/pages/{Login,Register,ForgotPassword,ResetPassword,OAuthConsent}.jsx`, `src/components/UserNotRegisteredError.jsx`, `src/components/ProtectedRoute.jsx`, `src/lib/AuthContext.jsx`, `src/App.jsx`.
- **Verificación:**
  - Build y lint.
  - Playwright local a 390 y 1440, claro y oscuro, en las 5 pantallas.
  - Un 401 simulado debe acabar en `/login`, no en el dominio de Base44.
  - Después del deploy, buscar el titular nuevo dentro del bundle servido (verificación por contenido).

**B. Tema, chrome de Layout y aviso de licencia (módulos 12, 23 y la parte del aviso de los módulos 1/7/10). Tamaño M.**
- **Cambios:**
  - Copiar `shared/theme/ThemeSwitcher.jsx` byte a byte. Crear `ThemeContext.jsx` con `STORAGE_KEY='sommel-theme'` y `useThemeMode.js`. `useTheme.js` se borra.
  - El proveedor y el `<ThemeSwitcher/>` se montan en `src/main.jsx`, fuera del router, para que salgan también en `/login` y en el 404.
  - En `Layout.jsx` se quitan el botón del sidebar y sus iconos. Se agrega el aviso persistente de view_only/suspended y de días de prueba restantes, leyendo el `WineBar` del inquilino, con enlace a soporte. El scroll del `<nav>` se guarda en `sessionStorage` y se restaura en `useLayoutEffect`.
  - En `index.css` van `--theme-switcher-bottom/right` y una media query que lo sube por encima de la barra fija de `Orden.jsx`.
  - `index.html`: el `catch` del script cae en `system`, igual que el hook, con los comentarios cruzados.
  - `sonner.jsx` toma el tema resuelto (antes confirmar si se monta).
  - Los chips rojo, ámbar, esmeralda y azul reciben su variante `dark:`.
  - Se escribe la suite de smoke: `tests/smoke/smoke.spec.js` (copia exacta), `tests/smoke/smoke.config.js` (con rutas públicas y `theme.root` igual a la raíz real del switcher), `playwright.config.js` y `.github/workflows/smoke.yml`.
- **Archivos:** `src/components/ThemeSwitcher.jsx`, `src/lib/{ThemeContext.jsx,useThemeMode.js,useTheme.js}`, `src/main.jsx`, `src/components/Layout.jsx`, `src/index.css`, `index.html`, `src/pages/Orden.jsx`, `src/components/ui/sonner.jsx`, `src/components/orders/{TableCard.jsx,helpers.js}`, `tests/smoke/*`, `playwright.config.js`, `.github/workflows/smoke.yml`.
- **Verificación:** build; Playwright local a 390/834/1440 con el switcher plegado y desplegado; recargar una ruta profunda y comprobar el resaltado y el scroll.

**C. Permisos del lado del servidor y endurecimiento de guardias (módulos 3, 14, 2 y 7 en su parte de claves). Tamaño M.**
- **Cambios:**
  - Nueva función `base44/functions/permissions/` con `getProfile` y `upsertProfile`. Exigen `bar_admin` o plataforma y pasan por `requireWritable`. `tenant_id` sale de `ctx`, nunca del cuerpo. Solo acepta claves que existen, con valores booleanos.
  - En la plantilla de `_guard`, `allowNoTenant` pasa a `false` por defecto, con una marca por ruta solo para `catalog.importMenu`. Se regeneran las copias.
  - `permissionRegistry.js` recibe un mapa de etiquetas y las claves nuevas: `Ajustes:exportar`, `Equipo:invitar`, `Equipo:cambiar_rol` y `Equipo:quitar` (por defecto `staff: false`).
  - `manageStaff`: después de degradar o quitar a alguien, vuelve a contar los admins y revierte si quedan 0. `revokeInvite` pasa por el gate de facturación.
  - Se prerregistran `account` y `session` en los destinos de `generate-guards`.
- **Archivos:** `base44/functions/permissions/**`, `scripts/generate-guards.mjs`, `scripts/templates/*`, `base44/functions/*/_guard*.ts` (regenerados), `base44/functions/manageStaff/**`, `src/lib/permissionRegistry.js`, `base44/tests/{permissions_logic_test.ts,guard_logic_test.ts,staff_members_logic_test.ts}`.
- **Verificación:** `check:guards`, `validate:functions` (debe dar 14/40) y los tests de deno.

**D. Puente `acaciaControl` y `createWineBar` (módulos 5, 15, 17 en su lado Sommel, 16 en su guardia, 1 y 22). Tamaño L.**
- **Cambios:**
  - `base44/functions/acaciaControl/entry.ts` con las acciones `ping` (lectura real de `WineBar` con `asServiceRole`), `license.get/set` (patch sobre `WineBar`), `tenants`, `tickets.list` (sobre `SupportTicket`), `usage` y `sessions.list/revoke` (sobre `AppSession` en su forma actual).
  - Si falta `INGEST_HMAC_SECRET` o `ACACIA_APP_SLUG`, responde 503 (falla cerrado).
  - `_acaciaSign.ts` es copia exacta del estándar, con `ACCEPT_LEGACY_MASTER=false`. `base44/functions/acaciaSign.test.ts` va en la raíz de functions.
  - `createWineBar`: `auth.me()` envuelto para responder 401; `computeTrialEnd` extraído y probado (30 días, estado `trial`).
- **Archivos:** `base44/functions/acaciaControl/**`, `base44/functions/acaciaSign.test.ts`, `base44/functions/createWineBar/**`, `base44/tests/{bridge_test.ts,trial_test.ts}`.
- **Verificación:** vector HMAC; una firma de otra app es rechazada; secreto ausente es rechazado; `validate:functions` debe dar 15/40.

**G. Bloqueos del módulo 19 y limpieza de entidades (módulos 19 y 2). Tamaño M.**
- **Cambios:**
  - Reescribir las descripciones de `WineBar.owner_id`, de `unit_cost` en `OrderItem`, `InventoryItem` e `InventoryMovement`, y de `User.role`. Cada una debe decir qué operación gobierna, quién la usa y qué se rompe si se quita.
  - La razón de los bloqueos a nivel entidad (`Product.read`, `Attendance.read` y las escrituras solo-admin) pasa a descripciones que sí se despliegan.
  - ~~Quitar `super_admin` del enum de `User.app_role`.~~ Hecho el 2026-10-06.
  - `scripts/validate-locks.mjs` con su manifiesto, más `base44/tests/locks_test.ts`, que corre solo en el paso de deno que ya existe en CI.
- **Archivos:** `base44/entities/{WineBar,OrderItem,InventoryItem,InventoryMovement,User,Product,Attendance,Order,Payment,Shift,CashMovement,StaffInvite,PermissionProfile,StaffPin}.jsonc`, `scripts/validate-locks.mjs`, `base44/tests/locks_test.ts`.
- **Verificación:** `validate:rls`, el locks test y `validate:tenant-roles`.

**E. Cableado de CI y scripts (módulos 13, 15, 19 y 22). Tamaño S. Se mergea al final de la ola 1, después de D y G.**
- **Cambios:**
  - En `package.json`: `test:smoke`, `@playwright/test ^1.63.0`, `validate:locks`, `check:bridge` y `check:auth-me`. `lint` pasa a encadenarlos.
  - Nuevos `scripts/check-bridge-drift.mjs` y `scripts/check-auth-me-usage.mjs`.
  - Los pasos correspondientes en `ci.yml`.
  - `test-results/` y `playwright-report/` en `.gitignore`.
- **Archivos:** `package.json`, `package-lock.json`, `.github/workflows/ci.yml`, `.gitignore`, los dos scripts.

**F. Documentación de estado (módulos 4, 11, 13, 14, 16, 19 y 24). Tamaño S.**
- **Cambios:**
  - `CLAUDE.md` deja de ser solo un puntero y trae secciones con fecha:
    - la auditoría del módulo 4/14 y lo que no se verificó;
    - la sección de deploy del módulo 11: los cinco scripts, nunca `--app-id`, el paso de Publish y verificar por contenido;
    - la sección del smoke;
    - el inventario de bloqueos del módulo 19;
    - el módulo 24.
  - Corregir en `AGENTS.md` la viñeta que se contradice con el flujo; corregir `README.md` ("Publish Your Changes").
  - Crear `docs/BACKEND_FUNCTION_LIMIT_REORG.md` con el mapa de routers a handlers.
  - Crear `docs/secrets.md`: todos los secretos marcados "no configurado" y el correo documentado como integración de Base44.
  - Corregir `plan-tecnico.md`: 7 usuarios y `billing_status`.
- **Archivos:** `CLAUDE.md`, `AGENTS.md`, `README.md`, `docs/plan-tecnico.md`, `docs/BACKEND_FUNCTION_LIMIT_REORG.md`, `docs/secrets.md`, `docs/locks-audit.md`.

### Ola 2 (en paralelo)

- **H1. Pantalla de Permisos (módulo 3). Tamaño M.** Matriz por sección, overrides del rol staff, y cada cambio se guarda al momento con `permissions.upsertProfile`. Archivos: `src/pages/Permisos.jsx`, `src/components/permissions/*`.
- **H2. Cuenta (módulo 7). Tamaño L.**
  - Nueva función `account` con tres acciones:
    - `exportData`: sin gate de facturación, a propósito;
    - `deleteMyAccount`: la bloquean ser el owner o el último admin;
    - `delegateBar`.
  - `settings.get` pasa a exponer plan, estado y fechas.
  - Nuevos `LicenseCard.jsx` y `DangerZone.jsx`, con confirmación en tres pasos. `Ajustes.jsx` los monta.
  - `deleteBar` queda fuera hasta que haya decisión (sección 3).
  - Archivos: `base44/functions/account/**`, `base44/functions/settings/handlers/_shared.ts`, `src/components/settings/{LicenseCard,DangerZone}.jsx`, `src/pages/Ajustes.jsx`, `base44/tests/account_logic_test.ts`.
- **H3. Soporte (módulo 8, lado cliente). Tamaño M.** `SupportTicket.create`, luego `fetch` a `control.acaciaco.com.mx/api/ingest/ticket-pull` con `{app:'sommel', ticketId}` y `.catch(()=>{})`. Al usuario solo se le muestra "enviado" o "resuelto". Archivos: `src/pages/Soporte.jsx`, `src/lib/supportTickets.js`.
- **H4. Versión y Acerca de (módulos 6 y 21). Tamaño L.**
  - `appConfig.js` con historial sembrado desde git; `package.json` a la misma versión.
  - Port de `publish-release.mjs` y de `auto-release-pr.yml` (changelog desde títulos de PR si no hay API key), más `check-version-sync.mjs` en CI.
  - `About.jsx` con manual buscable, contacto (correo y WhatsApp 449 895 8291) y la línea de ACACIA; `AppUpdateBanner.jsx`.
  - Archivos: `src/lib/{appConfig.js,manualContent.js}`, `src/pages/About.jsx`, `src/components/{UserManual,AppUpdateBanner}.jsx`, `scripts/{publish-release,check-version-sync}.mjs`, `.github/workflows/{auto-release-pr.yml,ci.yml}`, `package.json`.
- **H5. Sesiones (módulo 20). Tamaño L.**
  - `AppSession` gana `user_id`, `device_id`, `device_name`, `status` y `last_seen`, **sin quitar** `revoked_at` ni `last_active_at`.
  - Nueva función `session` con `manageSession`, `sessionHeartbeat` (403 si está revocada por cualquiera de los dos campos) y `revokeSession`.
  - `purgeStaleSessions` con `CRON_SECRET` que falla cerrado (503) y un umbral de 48 h con test.
  - Copias de los hooks y diálogos compartidos; `ActiveSessions.jsx`.
  - Archivos: `base44/entities/AppSession.jsonc`, `base44/functions/{session,purgeStaleSessions}/**`, `scripts/lib/entity-rls-rules.mjs`, `src/hooks/{useSessionManager,useActivityTracker}.js`, `src/components/{IdleWarningDialog,SessionExpiredDialog}.jsx`, `src/components/settings/ActiveSessions.jsx`, `base44/tests/session_logic_test.ts`.
  - Presupuesto de funciones: ~18/40.

### Ola 3 (un solo agente, integración). Tamaño M.
- **Cambios:**
  - Rutas en `App.jsx`: `/permisos` (bar_admin), `/soporte` y `/about` (todos los roles).
  - En `Layout.jsx`: las entradas de navegación, el montaje de `AppUpdateBanner` y de los diálogos de sesión, y la llamada a `useActivityTracker`.
  - `Ajustes.jsx` monta `ActiveSessions` y el botón "solicitar baja" (ticket de tipo `baja` más el aviso a `ticket-pull`).
  - Rehacer `src/lib/rbac.js` y cambiar los literales de rol del cliente, incluido `Staff.jsx`, con un texto claro al promover a alguien.
  - Actualizar `CLAUDE.md` con todo lo que se agregó.

## 3. Lo que está bloqueado y de quién depende

- **Operador (José), deploy:**
  - `npm run deploy`, `deploy:site` y `deploy:entities` (este último para G y H5), y después **Publish en el panel de Base44**.
  - Verificar por contenido: que el titular del login esté en el bundle, y que una acción que solo existe en el código nuevo no responda `unknown action`.
  - Disparar `smoke.yml` en Actions y anotar el número de corrida.
- **Secretos en Base44, que pone el operador y luego relee:**
  - `INGEST_HMAC_SECRET` (el mismo valor que en MC), `ACACIA_APP_SLUG=sommel`, `PLATFORM_OWNER_EMAIL` y `CRON_SECRET`.
  - `ACACIA_MC_INGEST_URL` no aplica si se elige `ticket-pull`.
  - La prueba es una sincronización de MC sin ninguna línea `rejected the derived key` para sommel.
- **Repositorio de Mission Control:**
  - Migración `0047_seed_sommel.sql`: `WineBar` con los campos `plan`, `billing_status`, `trial_end_at` y `current_period_end`.
  - Entradas nuevas en `licenseControl.js`, `licenseCatalog.js` (con su test), `ticketControl.js` (con los estados en español), `messaging.js` (rol `bar_admin`) y `APP_SLUGS`.
  - Aplicar la migración a producción y pulsar "Sincronizar ahora". La prueba es una fila `app_health` en `ok` y una fila `control:run-sync`.
  - El aviso de inquilino nuevo del módulo 1 depende de que exista `/api/ingest/tenant-pull` en MC. Hay que confirmarlo.
- **Decisiones de Alby o José:**
  - Nombres de plan y modo de cobro.
  - Qué hacer con el override de `SuperAdmin.jsx`: quitarlo o pasarlo por una función de plataforma.
  - `deleteBar`: borrado en cascada o retener pedidos y pagos por motivos fiscales.
  - `SupportTicket`: adaptar MC a los estados en español (lo recomendado) o alinear Sommel al resto del portafolio.
  - Si el staff puede alguna vez gestionar el equipo.
  - Si `SupportTicket.create` mantiene la rama de inquilino.
  - Si Sommel va en la lista pública de `apps/` o queda como micrositio privado de Vindima.
  - Precio, logo y canal de soporte.
  - El copy del manual.
- **Repositorio acaciaco-site (módulo 9):** `apps/sommel.html`, logo, tarjetas, sitemap y, opcionalmente, `KNOWN_APPS`. Se puede redactar un borrador, pero depende de las decisiones de arriba. Hasta que exista, el enlace del login a `/apps/sommel` da 404.
- **Credenciales QA o una sesión real:**
  - Matriz cruzada entre inquilinos con `+sommelstaff` y `+sommelnew`.
  - Revisar si el realtime de `OrderItem` deja pasar `unit_cost`.
  - Aviso de inactividad y cierre forzado; prueba del purge a 49 h.
  - Revisión manual del switcher en las pantallas autenticadas.
- **Repositorio del estándar:** el recordatorio de "Publica y verifica" en `base44-deploy.mjs` va primero en la copia canónica.
- **Opcional:** una API key de Anthropic como secreto del repo, si se quiere el changelog generado por IA.
- **DNS:** no se necesita nada. `sommel.acaciaco.com.mx` ya responde 200.

## 4. Riesgos y contradicciones

1. **Clave de tema.** La auditoría del módulo 13 propone la clave compartida `acacia-theme`; la del 12 mantiene `sommel-theme`. Se queda `sommel-theme`, que se declara en `smoke.config.js`, para no borrar la preferencia de los usuarios. El `kind`/`root` del smoke tiene que coincidir con la raíz real del switcher, no con la del ejemplo.
2. **Quién escribe `billing_status`.** Los módulos 1, 3, 7 y 14 piden lo mismo sobre `SuperAdmin.jsx`. Es una sola decisión y la ejecuta un solo paquete, en la ola 3 o después.
3. **Dos formas de `AppSession`.** El estándar pide `status`/`last_seen`; MC usa `revoked_at`/`last_active_at`. Se conservan las dos. El heartbeat, el purge y `acaciaControl.sessions` tienen que tratar ambas como revocación. D se escribe sobre la forma actual y H5 la amplía sin romperla.
4. **Aviso de tickets.** El módulo 15 propone un push firmado con `ACACIA_MC_INGEST_URL`; el módulo 8 propone `ticket-pull`. Se usa `ticket-pull`: el CLAUDE.md de MC lo documenta como el diseño que no se puede falsificar, y no necesita secreto.
5. **Merge dentro de la ola 1.** Con `allowNoTenant=false` por defecto, una ruta de plataforma podría romperse; hay que probar `importMenu`. E cablea scripts que dependen de lo que traen D y G, así que se mergea al último. G cambia descripciones que el manifiesto de `validate-locks` comprueba; por eso los dos van en el mismo paquete.
6. **Orden frente a MC.** Si la fila `apps` de sommel entra en MC antes de que el puente y los secretos estén vivos, cada sincronización registra errores para sommel. El orden correcto es: deploy y Publish de `acaciaControl`, luego secretos releídos, luego la fila en MC y los catálogos.
7. **Excepciones intencionales que un agente podría "arreglar".** `exportData` no lleva gate de facturación, a propósito. El aviso de licencia no debe bloquear el login, porque un bar suspendido tiene que poder entrar y ver el mensaje.
8. **Versionado.** En cuanto `auto-release-pr.yml` exista, nadie vuelve a tocar a mano la versión ni el changelog.
9. **Cuánto mide el smoke.** El smoke solo cubre las rutas públicas. Pasar en verde no demuestra nada de las pantallas autenticadas, y así hay que dejarlo escrito.
10. **Mergear no despliega.** Ningún paquete queda cerrado hasta que el operador despliega, pulsa Publish y se verifica por contenido. El "unchanged" de la CLI no cuenta como prueba.
## Desviaciones ola 1

- **LicenseBanner sin clave de permiso.** El banner leía `stations.getConfig`
  (Estaciones:operar) y `settings.get` (Cobro:cobrar o Ajustes:editar); personal
  con esas claves revocadas nunca veía por qué sus escrituras daban 402. Se
  añadió la acción `settings.billing` (solo membresía; devuelve
  `billing_status` y `trial_end_at`) dentro del grupo `settings`, sin endpoint
  nuevo (sigue 15/40). El banner llama solo a esa acción.
- **Pie de AuthLayout.** Por debajo de `lg` el pie lleva `pb-12` para no quedar
  bajo la pista abierta del selector de tema a 390px (no se volvió a capturar).
- **CI sin pasos duplicados.** Se quitaron `validate:locks`, `check:bridge` y
  `check:auth-me` de `ci.yml`: `npm run lint` ya los encadena.
- **CLAUDE.md** actualizado: smoke/playwright/.gitignore ya cableados, bloque de
  comprobaciones, comando de deno de CI y conteo integrado (374/0).

## Decisiones (José, 2026-09-29) que gobiernan la ola 2

1. **Licencia desde el panel de plataforma de Sommel: se conserva, por servidor.** `SuperAdmin.jsx` deja de escribir `WineBar` desde el navegador. Llama a una acción solo de plataforma (`isPlatform`) que cambia `billing_status`/`trial_end_at`/`current_period_end`/`plan` y deja auditoría (quién, cuándo, valor anterior, nota). Mission Control sigue siendo el dueño principal; esto es el ajuste manual que el módulo 1 permite.
2. **Borrar un bar retiene lo fiscal.** `account.deleteBar` (solo el dueño, confirmación en tres pasos, exportación ofrecida antes) archiva: `WineBar.billing_status = suspended` + `archived_at`, desliga a todos los usuarios (`tenant_id`/`app_role` vacíos), borra `StaffPin` y `StaffInvite` pendientes. **Se conservan** `Order`, `OrderItem`, `Payment`, `Shift`, `CashMovement`, `InventoryMovement` y `Attendance` (CFF art. 30: 5 años). El texto de la UI lo dice.
3. **Sommel va en la lista pública de apps de acaciaco.com.mx** (módulo 9). Sin precio publicado hasta que José lo confirme: la tarjeta de precio dice "Cotiza" con enlace a soporte y WhatsApp.
4. **Cualquiera puede crear su propio bar de prueba** (se conserva `createWineBar` por cuenta propia, 30 días).

## Desviaciones ola 2

Registradas por el agente de correcciones, 2026-09-29.

- **Cuenta fuera de Ajustes.** Licencia, sesiones activas y zona de peligro pasan
  de `/ajustes` (`Ajustes:editar`, staff false) a una ruta nueva `/cuenta`, sin
  permiso, con entrada de menú para todos los roles. Se alimenta de
  `settings.billing` (solo membresía), que ahora devuelve además `name`, `plan`,
  `current_period_end` e `is_owner`. `settings.get` sigue con permiso.
- **Baja = ticket.** `account.deleteBar` y `account.deleteMyAccount` escriben un
  `SupportTicket` `kind: 'baja'` (best effort, antes de desligar) y devuelven
  `ticket_id`; `DangerZone` avisa con `notifyMissionControl`. Un fallo al crear el
  ticket no bloquea la baja. `Soporte` acepta `?tipo=baja`.
- **Export sin costos.** `account.exportData` exige además `Menú:ver_costos` para
  incluir costos (Product, OrderItem, InventoryItem, InventoryMovement); si falta,
  van fuera y el payload trae `costs_redacted: true`. También quita `license_audit`
  y `owner_id` de la fila del bar.
- **Claves `Equipo:*` ocultas en Permisos.** Ningún servidor las consulta
  (`manageStaff` exige `bar_admin`). `NOT_ENFORCED_KEYS` en `permissionsLogic.js`
  las esconde; se quita la clave de la lista en el mismo cambio que la haga cumplir.
- **Permisos y cuenta de plataforma.** La cuenta de plataforma sin bar ya no ve
  Permisos (menú, ruta y pantalla exigen `tenant_id`).
- **Versión 0.15.0 sembrada a mano** (changelog y `package.json`), contra la regla
  de "solo el release la escribe": `appConfig.js` es archivo nuevo en este merge y
  el propio merge sería el ancla del release, que se saltaría su PR.
  `publish-release.mjs` ahora ancla en el último commit `chore: release`.
- **`IdleWarningDialog.jsx` diverge del canónico** (tokens de tema en lugar de
  `yellow-500`, por la regla "solo tokens"). No se subió al repo estándar desde
  aquí; queda por hacer allá. `SessionExpiredDialog.jsx` diverge por el módulo 10
  (login propio). Ninguna de las dos tiene comprobación de deriva.
- **Literales de rol** sustituidos por `@/lib/rbac` en Permisos, DangerZone,
  ActiveSessions, MemberActions, Staff y PageNotFound.
- **Manual** corregido (los permisos se ven en la siguiente carga) y ampliado
  (cuenta, sesiones, exportar, ceder/baja, soporte, aviso de versión).
  `MANUAL_LAST_REVIEWED` no se tocó: falta lectura humana.
- **Sitio (acaciaco-site).** `apps/sommel.html` enlaza a
  `https://sommel.acaciaco.com.mx/register` en el hero y en la franja de precio, y
  el rótulo pasa a "Prueba gratis por 30 días". Sommel sigue fuera de
  `apps/index.html` (igual que ArtisKids); pendiente de decidir.
