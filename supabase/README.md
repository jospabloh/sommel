# Sommel en Supabase: fase 1 (esquema, RLS y pruebas de aislamiento)

Alcance: solo SQL. Diseño aprobado en `docs/migracion-supabase.md` (secciones 3.1 y 3.2).
Nada de esto se ha aplicado a ninguna base de datos. La fuente de verdad de los
campos es `base44/entities/*.jsonc` y `scripts/lib/locks-rules.mjs`.

## Archivos

| Archivo | Qué hace |
|---|---|
| `migrations/20261014000001_core.sql` | Las 27 tablas de entidad, las 3 tablas de costo, índices, restricciones de idempotencia, claves foráneas compuestas, triggers de `updated_date` y el trigger que crea el `profile` al registrarse |
| `migrations/20261014000002_rls.sql` | Funciones `app.*`, RLS activo en todas las tablas, privilegios, políticas, publicación de Realtime |
| `tests/00_supabase_stub.sql` | Solo para un Postgres de pruebas: emula roles, `auth.users`, `auth.uid()` y los privilegios por omisión de Supabase. **Nunca** se aplica a un proyecto de Supabase |
| `tests/isolation.sql` | Pruebas de aislamiento, 1,633 aserciones, una sola transacción con `rollback`. Corre en Postgres con el stub **y** en una base de Supabase real |

## Cómo aplicar

Orden estricto: `core`, luego `rls`.

- **Supabase CLI**: `supabase db push` (los nombres ya llevan marca de tiempo).
- **MCP de Supabase**: `apply_migration` dos veces, en ese orden, con el contenido de cada archivo.

`pg_cron` no se habilita aquí (la purga de sesiones es de otra fase).

## Cómo correr las pruebas

Contra un Postgres de pruebas (16 o más reciente), no contra producción:

```bash
createdb sommel_scratch
psql -v ON_ERROR_STOP=1 -1 -d sommel_scratch -f supabase/tests/00_supabase_stub.sql
psql -v ON_ERROR_STOP=1 -1 -d sommel_scratch -f supabase/migrations/20261014000001_core.sql
psql -v ON_ERROR_STOP=1 -1 -d sommel_scratch -f supabase/migrations/20261014000002_rls.sql
psql -v ON_ERROR_STOP=1 -1 -d sommel_scratch -f supabase/migrations/20261014000003_support_ticket_server_only.sql
psql -v ON_ERROR_STOP=1 -d sommel_scratch -f supabase/tests/isolation.sql
```

Termina con `NOTICE: ISOLATION TESTS PASSED: N assertions`. Cualquier fallo
sale con `ASSERTION FAILED: ...` y código distinto de cero. El script crea sus
propios datos y hace `rollback`, así que se puede repetir.

Contra una rama de Supabase o un proyecto de pruebas **vacío** (sin el stub):
aplicar las dos migraciones y correr solo `isolation.sql`, con el rol `postgres`
(puede hacer `SET ROLE` a `anon`, `authenticated` y `service_role`). Es el mismo
script: crea los usuarios con `isotest.add_user`, que mira qué columnas tiene
`auth.users` y rellena solo las que existen (`instance_id`, `aud`, `role`,
`email`, `raw_app_meta_data`, `raw_user_meta_data`, `created_at`, `updated_at`).
Se probó con dos formas de `auth.users` (completa y mínima). Si `wine_bar` o
`profile` ya tienen filas, el script aborta antes de tocar nada. No usar
`supabase test db`: ese comando espera archivos pgTAP y trataría estos `.sql`
como tales. **No verificado contra un Supabase real**: el trigger sobre
`auth.users` y las columnas reales de GoTrue están inferidos, no ejercidos.

### Lo que prueba `isolation.sql`

1. **Catálogo**: RLS activo en toda tabla de `public` (si se añade una tabla sin
   RLS, falla); toda tabla está clasificada en la prueba (una tabla nueva sin
   clasificar falla); `anon` sin ningún privilegio; `authenticated` solo con
   `SELECT` donde toca y ningún privilegio de escritura (ni por columnas); el
   conjunto exacto de políticas; las funciones `SECURITY DEFINER` con
   `search_path` fijado; ninguna columna de costo ni secreta legible desde el
   navegador; la publicación de Realtime con exactamente 4 tablas.
2. **Restricciones**: idempotencia (pagos, movimientos de caja y de inventario,
   trabajos de impresión, perfiles de permisos, PIN, llaves de acceso, un solo
   checado abierto, una invitación pendiente), claves foráneas entre inquilinos
   rechazadas, borrado de bar en cascada, `updated_date`, que los metadatos del
   registro no den bar ni rol.
3. **Matriz de aislamiento, dos pasadas** con admin de A, staff de A, admin de B,
   usuario sin bar, dueño de plataforma, `anon` y `service_role`, tabla por tabla:
   - pasada 1: con los privilegios tal como se migran (la negación debe ser un
     error de privilegio, no casualidad);
   - pasada 2: se concede `ALL` a `anon` y `authenticated` sobre todas las
     tablas y se repite todo. Demuestra que **solo la RLS** ya aísla y bloquea
     escrituras (defensa en dos capas: si alguien afloja un `GRANT` por error,
     la RLS sigue negando).
4. Mutaciones: se comprobó a mano que 15 sabotajes (RLS apagado, política
   `using (true)`, `GRANT UPDATE`, tabla sin clasificar, `anon` con `SELECT`,
   columna `unit_cost` en `order_item`, FK compuesta eliminada, etc.) hacen
   fallar el script.

## Decisiones de nombres

| Base44 | Supabase | Por qué |
|---|---|---|
| `Order` | `orders` | `ORDER` es palabra reservada; sin comillas rompería consultas, políticas y la capa de compatibilidad |
| `User` | `profile` | `user` es reservada y la identidad vive en `auth.users`. `profile.user_id` es esa misma id |
| `User.role` (`admin`/`user`) | `profile.is_platform` | El `role: admin` de Base44 es solo del dueño de la plataforma |
| `WineBar` | `wine_bar` | snake_case |
| resto | snake_case singular | `BarTable` pasa a `bar_table`, etc. |

## Mapa entidad a tabla

| Entidad Base44 | Tabla | Clase |
|---|---|---|
| WineBar | `wine_bar` | tenant; solo servidor |
| User | `profile` | el navegador lee solo su fila |
| BarTable | `bar_table` | lectura por bar |
| Category | `category` | solo servidor |
| MenuExtra | `menu_extra` | solo servidor |
| Order | `orders` | lectura por bar |
| OrderItem | `order_item` (+ `order_item_cost`) | lectura por bar, sin costo |
| Payment | `payment` | solo servidor |
| Shift | `shift` | solo servidor |
| CashMovement | `cash_movement` | solo servidor |
| InventoryItem | `inventory_item` (+ `inventory_item_cost`) | solo servidor |
| InventoryMovement | `inventory_movement` (+ `inventory_movement_cost`) | solo servidor |
| PrintJob | `print_job` | lectura por bar |
| PermissionProfile | `permission_profile` | lectura por bar |
| StaffInvite | `staff_invite` | solo servidor |
| SupportTicket | `support_ticket` | lectura por bar (el alta va por función) |
| Product | `product` | solo servidor |
| CloudPrinter | `cloud_printer` | solo servidor |
| StaffPin | `staff_pin` | solo servidor |
| Attendance | `attendance` | solo servidor |
| ApprovalLog | `approval_log` | solo servidor |
| ApprovalRequest | `approval_request` | solo servidor |
| Passkey | `passkey` | solo servidor |
| PhotoCheck | `photo_check` | solo servidor |
| SecurityAlert | `security_alert` | solo servidor |
| TerminalDevice | `terminal_device` | solo servidor |
| AppSession | `app_session` | solo servidor, sin `tenant_id` (es por usuario) |

### Lecturas directas del navegador (las únicas que existen)

Por mínimo privilegio, solo estas tablas tienen `SELECT` y política por bar para
`authenticated`: las que `src/` lee hoy directo con el cliente de entidades
(revisado con `grep` el 2026-10-14; `AuthContext`, `PageNotFound` y
`LicenseBanner` no leen entidades: usan `auth.me()`, que pasa a ser la fila
propia de `profile`, y la función `settings.billing`).

| Tabla | Dónde se lee |
|---|---|
| `bar_table` | `src/pages/Mesas.jsx:45` y `:65` (tiempo real), `src/pages/Estacion.jsx:115`, `src/pages/Orden.jsx:128` |
| `orders` | `src/pages/Mesas.jsx:46` y `:69`, `src/pages/Estacion.jsx:114` y `:165`, `src/pages/Orden.jsx:129`, `src/components/orders/useOrderRealtime.js:34` y `:55` |
| `order_item` | `src/pages/Estacion.jsx:124` y `:159`, `src/components/orders/useOrderRealtime.js:35` y `:69` |
| `print_job` | `src/components/printing/usePrintStation.js:154` (tiempo real) |
| `permission_profile` | `src/lib/PermissionContext.jsx:41` |
| `support_ticket` | lectura `src/lib/supportTickets.js:73` (el alta de `:58` pasa a `support.createTicket` en la fase 2) |
| `profile` (solo su fila) | `src/lib/AuthContext.jsx:88` y `src/lib/PageNotFound.jsx:15` (`auth.me()`) |

Todo lo demás (incluidos `wine_bar`, `staff_invite`, `cash_movement`, `shift`,
`payment`, `category`, `menu_extra`, `inventory_item`, `inventory_movement`) es
solo servidor: ninguna pantalla los lee directo; los sirven las funciones.
Si la fase 3 descubre otra lectura directa, se añade a la lista de la migración 2
y a `t_read` en la prueba, a propósito.

Son 27 tablas de entidad y 3 de costo (30 en total). "Solo servidor" significa
sin `GRANT` y sin política para `anon` y `authenticated`: solo el `service_role`
(las Edge Functions) las toca.

## Dónde vive hoy cada candado de Base44

El navegador **no escribe ninguna tabla** (sin políticas ni privilegios de
`INSERT`/`UPDATE`/`DELETE`), sin excepciones. Eso
sustituye de golpe todos los candados de escritura.

| Candado (`locks-rules.mjs`) | Ahora |
|---|---|
| `User.tenant_id`, `app_role`, `display_name`, `photo_check`, `permission_overrides` (escritura) | `profile` sin privilegio de escritura para el navegador; `app_role` con `CHECK` (`bar_admin`, `staff`, `terminal`). Las escribe `createWineBar`/`manageStaff` con la llave de servicio |
| `WineBar.billing_status`, `trial_end_at`, `current_period_end`, `plan`, `owner_id`, `archived_at`, `license_audit` (escritura) | `wine_bar` es solo servidor: ni lectura ni escritura para el navegador (más estricto que Base44, donde un `bar_admin` aún podía actualizar el resto de campos y todo el bar leía `license_audit`); `CHECK` en `billing_status` |
| `WineBar` create/delete | Sin privilegio para el navegador |
| `OrderItem.unit_cost`, `InventoryItem.unit_cost`, `InventoryMovement.unit_cost` (lectura solo admin) | Tablas de costo `order_item_cost`, `inventory_item_cost`, `inventory_movement_cost`, sin `GRANT` para el navegador. La columna ya no existe en las tablas legibles, así que **no puede viajar por Realtime** |
| `Product` (lectura y escritura solo admin) | `product` solo servidor (ver D3) |
| `Attendance`, `StaffPin`, `TerminalDevice`, `PhotoCheck`, `SecurityAlert`, `ApprovalLog`, `Passkey`, `ApprovalRequest`, `CloudPrinter` (lectura y escritura) | Solo servidor: sin `GRANT`, sin política |
| `Order`, `OrderItem`, `PermissionProfile` (escritura) | Lectura por bar; sin escritura para el navegador |
| `Payment`, `Shift`, `CashMovement`, `StaffInvite`, `InventoryItem`, `InventoryMovement` (escritura) | Solo servidor (ya no se leen desde el navegador) |
| Sin candado en el manifiesto: `BarTable`, `Category`, `MenuExtra`, `PrintJob`, `AppSession` | `BarTable` y `PrintJob`: lectura por bar, escritura solo servidor. `Category` y `MenuExtra`: solo servidor. `AppSession`: solo servidor (ver OQ5) |
| `SupportTicket` create con rama del inquilino | `INSERT` con `GRANT` por seis columnas y política `tenant_id = bar del usuario and status = 'abierto'` |

Candados nuevos que Base44 no tenía y la base ahora garantiza: claves foráneas
**compuestas** `(tenant_id, id)` entre padre e hijo (una fila nunca apunta al
padre de otro bar), una sola apertura de checado por persona, una sola
invitación pendiente por correo y bar, y las restricciones de idempotencia.

## Decisiones que el diseño no fijaba

- **D1. `tenant_id` en todo, claves compuestas.** Cada padre con hijos tiene
  `unique (tenant_id, id)` y los hijos usan `foreign key (tenant_id, parent_id)`.
  Costo: un índice extra por padre. Beneficio: un error de la capa de servidor no
  puede cruzar bares. Consecuencia para la capa de compatibilidad: todo `create`
  debe llevar `tenant_id` (ya lo hace hoy).
- **D2. Borrados.** `ON DELETE CASCADE` solo donde el hijo no existe sin el padre
  (`order_item` a `orders`, tablas de costo a su padre, todo a `wine_bar`).
  `payment`, `cash_movement`, `inventory_movement` y `orders.shift_id` usan
  `NO ACTION`: son registros financieros y no se pueden dejar huérfanos ni
  arrastrar por borrar un pedido, un turno o un insumo. Borrar un bar completo
  sí funciona (`NO ACTION` se evalúa al final de la sentencia; lo prueba la
  sección 6). `product.category_id` y `product.inventory_item_id` pasan a nulo
  si se borra el padre. `order_item.product_id` y `inventory_movement.order_item_id`
  **no** llevan FK: son historia y el producto o renglón puede desaparecer.
- **D3. `product` se queda solo servidor con el costo dentro.** Hoy ya lo es en
  Base44 (el costo de `variants[]` es un `jsonb` que ninguna política puede
  partir) y `catalog.listProducts` redacta el costo. Una tabla `product_cost`
  solo añadiría un `JOIN` a cada lectura del menú. Riesgo anotado: si en el
  futuro alguien le da lectura al navegador, filtraría el costo. Lo vigila la
  prueba `0.5`/`0.7` (cualquier `GRANT` o política nueva sobre `product` falla) y
  habría que crear entonces `product_cost`.
- **D4. Tablas de costo.** Clave primaria igual a la del padre (`order_item_id`,
  etc.), sin columna `id`. Escribirlas es trabajo de la capa de compatibilidad:
  `unit_cost` se parte al escribir y se une al leer (solo en el servidor).
- **D5. Tipos.** `integer` para centavos y enteros; `numeric` para cantidades,
  existencias, coordenadas y porcentajes; `uuid` para toda id (incluidas
  `user_id`, `table_ids`, `product_ids`); `text` para `created_by`, `opened_by`, `closed_by`,
  `cancelled_by`, `voided_by`, `edited_by`, `invited_by`, `seen_by`, `revoked_by`:
  se verificó en `base44/functions` que guardan el **correo** (`ctx.user.email`,
  `self.email`) y a veces una etiqueta de sistema (`'sistema'`,
  `'purgeStaleSessions'`) o `''`, por eso no son `uuid`. Los `CHECK` de enums permiten nulo cuando la columna
  es opcional. Los campos con `default` en el `.jsonc` son `NOT NULL DEFAULT`; los
  demás son anulables, como en Base44.
- **D6. Idempotencia.** `unique (tenant_id, idempotency_key)` en `payment`
  (siempre presente); índice único **parcial** en `cash_movement` e
  `inventory_movement` (donde la llave no es nula ni vacía); `unique (tenant_id,
  dedupe_key)` en `print_job`; `unique (tenant_id, role)` en `permission_profile`;
  `unique (tenant_id, user_id)` en `staff_pin`; `unique (credential_id)` global en
  `passkey`. Extras: un solo checado abierto por persona y una invitación
  pendiente por (bar, correo sin distinguir mayúsculas), que sustituyen limpiezas
  de "conservar uno y borrar el resto" del código actual.
- **D7. `profile` nace por trigger.** `app.handle_new_user` (en `auth.users`)
  crea la fila al registrarse, copiando solo correo y nombre. `tenant_id`,
  `app_role` e `is_platform` jamás salen de los metadatos que controla el
  usuario (lo prueba la sección 2.6). Otro trigger mantiene `profile.email` al
  día. Alternativa si no se quiere un trigger en `auth`: que `createWineBar`
  haga el `upsert`; entonces hay que cambiar `app_session.user_id` y las FK a
  `profile` en `staff_pin`, `passkey`, `photo_check` y `security_alert`.
- **D8. Qué usuario se borra con qué.** `profile` cae con `auth.users`. `staff_pin`,
  `passkey`, `photo_check` y `security_alert` caen con el `profile` (credenciales
  y datos biométricos no deben sobrevivir a la cuenta). `attendance`,
  `approval_log`, `approval_request` y `terminal_device` no tienen FK a personas:
  son bitácora o retención legal (CFF art. 30) y la cuenta sintética de una
  terminal se borra al revocar mientras el registro se conserva.
- **D9. `support_ticket`: el navegador no lo escribe.** La migración 2 dejaba
  insertar seis columnas del propio bar; la 3 lo quita (revisión de Codex en
  #84), porque el cliente elegía `created_by_email` y un ticket podía decir que
  lo abrió cualquiera. En la fase 2 el alta pasa a `support.createTicket`, que
  saca el bar, el autor y su correo de la sesión, como ya hace `replyTicket`.
  Es una diferencia con Base44, donde hoy el navegador lo crea directo.
- **D10. Realtime.** Publicación solo con `orders`, `order_item`, `bar_table`,
  `print_job`. `REPLICA IDENTITY` queda en `DEFAULT`: los eventos `DELETE` llevan
  solo la clave primaria. El cliente debe quitar por `id` (lo que ya hace
  `applyRealtimeEvent`).
- **D11. Privilegios por omisión.** Supabase concede `ALL` a `anon`/`authenticated`
  en toda tabla nueva. La migración 1 hace `ALTER DEFAULT PRIVILEGES ... REVOKE`
  para lo que cree el rol que migra, y la 2 revoca explícitamente sobre lo
  existente. El esquema `app` (helpers) no se expone por PostgREST. Un
  `service_role` explícito evita depender de los ACL por omisión.
- **D12. Las funciones `app.current_tenant()`, `current_app_role()` e
  `is_platform()`** son `SECURITY DEFINER`, `STABLE`, con `search_path = ''` y
  nombres calificados. Las políticas las llaman como `(select app.current_tenant())`
  para que Postgres las evalúe una vez por consulta. `anon` no puede ejecutarlas.
  El dueño de plataforma **no** tiene políticas especiales: el panel pasa por
  funciones con la llave de servicio.
- **D13. `profile`: lectura solo de la propia fila.** Ningún código de `src/` lee
  a otras personas por entidad (la lista del equipo la sirve `manageStaff`).
  Aviso: `profile` incluye `is_platform` y `permission_overrides`, visibles solo
  para su dueño.
- **D14. `updated_date`** se mantiene con `clock_timestamp()` (no `now()`), para
  que dos actualizaciones en una misma transacción avancen el valor. Lo instala
  un bucle sobre todas las tablas con esa columna.
- **D15. Seguridad de la tabla con RLS apagado por error.** La migración 2 activa
  RLS con un bucle sobre `pg_tables`, y la prueba `0.1` falla si alguna tabla de
  `public` queda sin RLS. Una tabla nueva en una migración futura debe repetir
  ese bloque (o el bucle) y entrar a la clasificación de `isolation.sql`.

## Preguntas abiertas (no se adivinó)

- **OQ1. Cerrada (decisión del 2026-10-14): mínimo privilegio.** Solo se lee
  directo lo que `src/` ya lee (tabla de arriba). `wine_bar`, `staff_invite`,
  `cash_movement`, `shift`, `payment`, etc. son solo servidor.
- **OQ2. Cerrada.** Ningún cliente escribe `wine_bar`; los ajustes pasan por
  `settings.update`.
- **OQ3. Forma de los datos para la capa de compatibilidad.** El código de hoy
  escribe cadenas vacías en algunos campos (por ejemplo `claimed_by: ''`, que aquí
  sigue siendo `text`); en las columnas `uuid` y `timestamptz` una cadena vacía
  falla, así que la capa debe normalizar `''` a `null`. No se auditó cada escritura. Las ids de Base44 (24 hex) ya no existen: no se migran
  filas, pero cualquier id fija en pruebas o semillas debe ser `uuid`.
  `table_ids` y `product_ids` son `uuid[]`, así que `includes` pasa a `@>` o a
  filtrar en memoria.
- **OQ12. Costos y la capa de compatibilidad.** Escribir y leer `unit_cost` implica
  tablas aparte (D4). Decidir en la fase 2 si la capa los une siempre o solo a
  petición, y que `Menú:ver_costos` siga siendo el único camino a leerlos.
- **OQ4. Cerrada: `terminal_device.pass_key` se queda en claro, a propósito.** Es
  la llave HMAC con la que el servidor verifica el pase de una terminal; para
  verificar hay que conocerla, así que un hash no sirve. La mitigación es que la
  tabla es solo servidor (sin `GRANT` ni política) y que se rota con
  `pass_epoch`. Un volcado de base de datos sí la expone: respaldar con cuidado.
- **OQ5. Cerrada: `app_session` es solo servidor.** Todas las lecturas van por la
  función `session`.
- **OQ7. `app_role` sin bar.** No se añadió un `CHECK` que obligue a que
  `app_role` implique `tenant_id`: `ON DELETE SET NULL` sobre `tenant_id` lo
  violaría al borrar un bar, y el "desligar" del código actual ya pone los dos en
  nulo. Si se quiere, se hace con un trigger.
- **OQ8. Rendimiento de Realtime con RLS.** Postgres Changes evalúa la política
  por suscriptor; para decenas de bares alcanza (ya anotado en el diseño, sección
  7). No se probó carga aquí.
- **OQ9. Esquema `app` y PostgREST.** Se asume que el proyecto expone solo `public`
  (y `graphql_public`). Verificar en Settings, API, "Exposed schemas".
- **OQ10. Cerrada el 2026-10-14.** Las dos migraciones se aplicaron al proyecto
  real `sommel` (`gyzmfplevicqwbynznei`) y `isolation.sql` pasó ahí sus 1,670 (con la migración 2; la 3 está pendiente
  de aplicar allá)
  aserciones (1,633 desde la migración 3), sin el stub: columnas reales de `auth.users`, triggers sobre
  `auth.users` y la publicación `supabase_realtime` funcionan. Releído después:
  no quedó ni el esquema `isotest`, ni usuarios `@example.test`, ni filas en
  `wine_bar`/`profile`, y `anon` no tiene ningún privilegio sobre `public`.
  `get_advisors` (seguridad) solo da INFO `rls_enabled_no_policy`, en las 23
  tablas que son solo del servidor a propósito.
- **OQ11. `CloudPrinter.created_by_id`** es en Base44 un campo propio (id de quien
  la dio de alta) además del `created_by_id` integrado; aquí es una sola columna
  `created_by_id uuid`. Mismo significado, sin duplicar.
