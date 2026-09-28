# Entrega 1: contratos entre agentes

Alcance (propuesta, semanas 1-3): **menú, mesas, comandas, cambios a la orden
y envío a cocina y barra con tiempos**. Criterio de cierre: Alby toma órdenes
de prueba y cocina las recibe. Fuera de alcance aquí: cobro, turno, reportes,
inventario, impresión (Entrega 2). Este documento es la fuente de verdad
entre agentes; si algo no cuadra, se corrige aquí primero.

## 1. Convenciones

- Dinero: **enteros en centavos MXN** en entidades y API. La UI formatea con
  `formatMXN(cents)` de `src/lib/money.js`.
- Tiempo: ISO-8601 UTC escrito por el servidor (`new Date().toISOString()`).
- Inquilino: `User.tenant_id`; rol del bar: `User.app_role`
  (`bar_admin` | `staff`). Built-in `role: admin` = dueño de la plataforma.
- **Forma de los registros (verificado 2026-09-28):** el SDK de Base44
  devuelve toda fila de entidad **plana** — `{ id, created_date, updated_date,
  ...campos }`, nunca `{ id, data: {...campos} }` — y `create`/`update`
  reciben también un objeto plano de campos. Esto vale para `User` igual
  que para cualquier otra entidad: `User.tenant_id`/`User.app_role` se leen
  y escriben planos, nunca bajo `.data`. Confirmado contra este mismo app
  Base44 en vivo, contra el tipo `EntityRecord = EntityTypeRegistry[K] &
  ServerEntityFields` del propio SDK, y contra StockFlow en producción
  (`record.business_id` 400+ veces, cero `record.data.business_id`). El
  prefijo `data.` existe **solo** dentro del JSON de una regla RLS
  (`"data.tenant_id"`, `{{user.data.tenant_id}}`) — nunca en una fila que el
  SDK entrega o recibe. `_guard.ts`, los handlers de `catalog`/`orders`/
  `stations`, y `createWineBar`/`manageStaff` leen y escriben en
  consecuencia.
- Ninguna página escribe entidades directo (`base44.entities.X.create/update/delete`
  prohibido en `src/`). Lecturas y `subscribe()` directas sí, salvo `Product`
  para quien no tiene `Menú:ver_costos` (usar `catalog.listProducts`), y salvo
  `WineBar` para cualquier código que no sea de plataforma (usar
  `stations.getConfig`, §4).
- Llamada desde el cliente:
  `base44.functions.invoke('<endpoint>', { action: '<accion>', ...payload })`.
  Respuesta `{ ok: true, ... }` o error HTTP con `{ error: '<mensaje en español>', code: '<snake_case>' }`.
  Sin sesión válida, `requireContext` responde **401 `unauthenticated`**
  (`'Inicia sesión para continuar'`) — fijado 2026-09-28: `base44.auth.me()`
  no devuelve `null` cuando no hay sesión, **lanza** (mensaje interno del SDK,
  "Authentication required to view users"), así que `requireContext` ahora
  envuelve la llamada y mapea cualquier falla ahí a 401 en vez de dejarla
  escapar al catch genérico de `handle()`, que la devolvía como 500
  `internal_error` con el mensaje en inglés del SDK.
- **D7 — redacción de costo en las respuestas de `orders`/`stations`:**
  `OrderItem.unit_cost` está bloqueado por RLS a la plataforma, pero eso solo
  protege una lectura directa de la entidad — la respuesta JSON de una
  función no pasa por RLS. Todo handler de `orders`/`stations` que devuelve
  fila(s) de `OrderItem` (`addItems`, `updateItem`, `cancelItem`, `send`,
  `markReady`, `markDelivered`, `undoReady`) llama una vez
  `hasPermission(ctx, 'Menú:ver_costos')` y pasa el resultado por
  `redactItemCost`/`redactItemCosts` (`scripts/templates/_guard_logic.ts`,
  re-exportadas desde `_guard.ts`) antes de responder — mismo patrón que
  `catalog.listProducts` ya usaba para `Product.cost`/`variants[].cost`.
  `cancelOrder`/`mergeOrders`/`moveTable`/`open`/`upsertTable`/`deleteTable`/
  `removeItem` no devuelven filas de `OrderItem`, así que no necesitan esto.
- Comentarios/identificadores en inglés; textos al usuario en español.

## 2. Guardia común del servidor (`_guard.ts`)

Base44 no comparte código entre directorios de función. Fuente canónica
`scripts/templates/_guard.ts`; `npm run generate:guards` la copia a
`base44/functions/<fn>/_guard.ts` de cada endpoint listado en
`scripts/generate-guards.mjs`, y `npm run check:guards` (en CI) falla si una
copia difiere. **Nadie edita las copias.** Exporta:

```ts
type Ctx = { base44, svc, user, self /* fresh User row */, tenantId, appRole, isPlatform, bar /* WineBar row */ }
requireContext(req, { allowNoTenant?: boolean }): Promise<Ctx>   // 401/403 as HttpError
hasPermission(ctx, key: string): Promise<boolean>                 // precedence: platform/bar_admin → PermissionProfile override → registry default
requirePermission(ctx, key): Promise<void>                        // 403 code 'forbidden'
requireWritable(ctx): void                                        // billing_status view_only|suspended → 402 code 'read_only'
loadOwned(ctx, entity, id): Promise<row>                          // svc read; 404 'not_found' if missing OR other tenant (same answer)
httpError(status, code, message): never
handle(req, routes: Record<string, (ctx, body) => Promise<object>>): Promise<Response>  // router: parses body, dispatches on action, maps HttpError, 400 'unknown_action'
PERMISSION_DEFAULTS  // generated from src/lib/permissionRegistry.js (AUTOGEN block)
```

Orden obligatorio en cada acción de escritura: `requireContext` (relee
`User` con `asServiceRole`, módulo 22) → `loadOwned` del registro →
`requirePermission` → `requireWritable` → validación → escritura con `svc`.

## 3. Registro de permisos (`src/lib/permissionRegistry.js`)

| Clave | bar_admin | staff |
|---|---|---|
| `Menú:ver` | ✓ | ✓ |
| `Menú:editar` | ✓ | ✗ |
| `Menú:ver_costos` | ✓ | ✗ |
| `Mesas:editar` (alta/baja/acomodo) | ✓ | ✗ |
| `Comandas:tomar` (abrir, agregar, editar lo no enviado, enviar) | ✓ | ✓ |
| `Comandas:cancelar_enviado` | ✓ | ✓ (queda registrado quién y por qué) |
| `Comandas:mover_mesas` (mover/unir) | ✓ | ✓ |
| `Comandas:cancelar_orden` | ✓ | ✗ |
| `Estaciones:operar` (marcar listo/entregado) | ✓ | ✓ |

`src/lib/PermissionContext.jsx` + `usePermission.js` (hook separado, por
react-refresh): `can('Sección:accion')` con la misma precedencia que el
servidor; lee `PermissionProfile` del bar.

## 4. Endpoints

### `catalog`
| action | payload | respuesta | permiso |
|---|---|---|---|
| `listProducts` | `{ include_inactive?: bool }` | `{ categories: Category[], products: Product[] }` — **sin `cost` ni `variants[].cost`** si falta `Menú:ver_costos` | `Menú:ver` |
| `upsertCategory` | `{ id?, name, sort?, station_default? }` | `{ category }` | `Menú:editar` |
| `deleteCategory` | `{ id }` | `{ ok }` — 409 `category_in_use` si tiene productos | `Menú:editar` |
| `upsertProduct` | `{ id?, name, category_id, station?, price, cost?, variants?, modifiers?, active?, seasonal? }` | `{ product }` | `Menú:editar`; `cost` solo con `Menú:ver_costos`, **si no llega se conserva el guardado** (lección `applyCost` de StockFlow) |
| `toggleProduct` | `{ id, active }` | `{ product }` | `Menú:editar` |
| `importMenu` | `{ menu: <base44/seed/vindima-menu.json>, dry_run: bool }` | `{ created, skipped, errors }` | **solo plataforma** (`isPlatform`), idempotente por (categoría, nombre) |

`Product.variants`: `[{ key: 'chico', label: 'Chico (2-4 personas)', price, cost }]`.
Con variantes, `price`/`cost` del producto se ignoran y cada línea elige una.
`Product.modifiers`: `[{ key, label }]`, sin costo (p. ej. "En leche").
`station` vacío hereda `Category.station_default`.

### `orders`
| action | payload | respuesta | permiso |
|---|---|---|---|
| `open` | `{ type: 'mesa'\|'llevar', table_id?, customer_name? }` | `{ order }` — mesa ocupada → 409 `table_busy` con `order_id` existente | `Comandas:tomar` |
| `addItems` | `{ order_id, items: [{ product_id, variant?, qty, modifiers?, notes? }] }` | `{ items: OrderItem[] }` status `nuevo`; precio y costo **congelados del servidor** | `Comandas:tomar` |
| `updateItem` | `{ item_id, qty?, modifiers?, notes? }` | `{ item }` — solo si `nuevo`; si no, 409 `already_sent` | `Comandas:tomar` |
| `removeItem` | `{ item_id }` | `{ ok }` — solo si `nuevo` (borra); si no, 409 `already_sent` | `Comandas:tomar` |
| `send` | `{ order_id }` | `{ sent: OrderItem[] }` — todos los `nuevo` → `enviado`, `sent_at` = ahora; idempotente | `Comandas:tomar` |
| `cancelItem` | `{ item_id, reason, prepared: bool }` | `{ item }` — `enviado`/`listo` → `cancelado`; motivo obligatorio | `Comandas:cancelar_enviado` |
| `moveTable` | `{ order_id, to_table_id }` | `{ order }` — destino ocupado → 409 `table_busy` | `Comandas:mover_mesas` |
| `mergeOrders` | `{ into_order_id, from_order_id }` | `{ order }` — mueve renglones, une `table_ids`, cancela la de origen | `Comandas:mover_mesas` |
| `cancelOrder` | `{ order_id, reason }` | `{ order }` — solo sin pagos (Entrega 1 no tiene pagos) | `Comandas:cancelar_orden` |
| `upsertTable` | `{ id?, name, seats?, zone?, x?, y? }` | `{ table }` | `Mesas:editar` |
| `deleteTable` | `{ id }` | `{ ok }` — 409 `table_busy` si tiene orden abierta | `Mesas:editar` |

Totales de la orden (`subtotal`, `total`) se recalculan en el servidor tras
cada cambio de renglones: suma de `unit_price*qty` de renglones no
cancelados. `BarTable.status` lo mantiene el servidor (ocupada si tiene orden
abierta). Todas las acciones rechazan una orden que no esté `abierta` con 409
`order_closed`.

### `stations`
| action | payload | respuesta | permiso |
|---|---|---|---|
| `markReady` | `{ item_ids: string[] }` | `{ items }` — `enviado` → `listo`, `ready_at` = ahora; idempotente | `Estaciones:operar` |
| `markDelivered` | `{ item_ids }` | `{ items }` — `listo` → `entregado` | `Estaciones:operar` |
| `undoReady` | `{ item_id }` | `{ item }` — `listo` → `enviado` si fue hace < 5 min (toque equivocado) | `Estaciones:operar` |
| `getConfig` | `{}` | `{ bar: { name, prep_goal_kitchen_min, prep_goal_bar_min } }`, leído de `ctx.bar` | `Estaciones:operar` — sin billing gate (lectura) |

`getConfig` existe porque el cliente **no puede** leer `WineBar` directo —
verificado en vivo 2026-09-28: `WineBar.get`/`filter`/`list` no devuelven nada
a un usuario normal, porque la regla RLS del lado de la entidad
(`{"id":"{{user.data.tenant_id}}"}`) nunca hace match contra una fila plana
(§1: el prefijo `data.` solo existe dentro de una regla RLS). No se relajó
esa RLS; en vez de eso, `Estacion.jsx` lee `prep_goal_kitchen_min`/
`prep_goal_bar_min` a través de esta acción, que sirve `ctx.bar` (ya cargado
con `asServiceRole` en `requireContext`).

## 5. Pantallas y dueño de cada archivo

| Agente | Archivos que posee (nadie más los toca) |
|---|---|
| **Base** | `scripts/templates/_guard.ts`, `scripts/generate-guards.mjs`, copias `_guard.ts`, `src/lib/permissionRegistry.js`, `src/lib/PermissionContext.jsx`, `src/lib/usePermission.js`, `src/lib/money.js`, `src/lib/api.js` (wrapper `callFn(endpoint, action, payload)` que lanza `ApiError{status,code,message}`), `src/App.jsx`, `src/components/Layout.jsx`, `base44/seed/vindima-menu.json`, esqueletos vacíos de las páginas de abajo, `package.json`, `.github/workflows/ci.yml`, entidades si hace falta ajustar |
| **Menú API** | `base44/functions/catalog/**`, `base44/tests/catalog_*_test.ts` |
| **Comandas API** | `base44/functions/orders/**`, `base44/tests/orders_*_test.ts` |
| **Estaciones API** | `base44/functions/stations/**`, `base44/tests/stations_*_test.ts` |
| **Menú UI** | `src/pages/Menu.jsx`, `src/components/menu/**` |
| **Comandas UI** | `src/pages/Mesas.jsx`, `src/pages/Orden.jsx`, `src/components/orders/**` |
| **Estaciones UI** | `src/pages/Estacion.jsx`, `src/components/stations/**` |

Rutas (las crea Base): `/menu`, `/mesas`, `/orden/:orderId`, `/orden/nueva?tipo=llevar`,
`/estacion/:station` (`kitchen` | `bar`). Las rutas del prototipo `/pos`,
`/products`, `/tables` se eliminan con sus páginas.

Requisitos de UI que vienen de la propuesta y sus pantallas de ejemplo:
- **Comandas** (pantalla 1, 7, 12): tablet y celular (una mano, 390 px). Mapa
  de mesas con estado; pedidos para llevar con nombre del cliente;
  categorías → productos, cantidades rápidas (+/−), variante obligatoria si
  el producto tiene, modificadores sin costo, nota por platillo; lo no
  enviado se distingue de lo enviado; botón "Enviar a cocina y barra";
  cambiar después de enviar = cancelar con motivo o agregar; mover/unir
  mesas; toast "Deshacer" para quitar un renglón no enviado.
- **Estaciones** (pantallas 3 y 8): lista por orden con mesa/cliente, hora de
  entrada, **barra de calor** (verde→ámbar→rojo contra `prep_goal_*_min`),
  aviso visible de cancelaciones ("CAMBIO"), marcar listo por platillo u
  orden, deshacer en 5 min. Tiempo real con `OrderItem.subscribe()`; el
  reloj avanza solo cada 30 s.
- **Menú** (pantallas 6 y 13): categorías, productos con precio, variantes,
  modificadores, estación, activo/temporada; costo y utilidad solo si
  `can('Menú:ver_costos')`. Alta en un par de pasos.
- Todo en español, tema claro y oscuro con los tokens existentes, sin colores
  fijos nuevos.

## 6b. Desviaciones aceptadas contra este documento (revisión 2026-09-28)

Una revisión de dos agentes encontró varios puntos donde el código construido
se separó de lo escrito arriba. Los que no eran errores se anotan aquí en vez
de forzar el código a coincidir con una redacción que ya no aplica:

- **`catalog.importMenu` recibe `tenant_id` en el payload**, no solo `menu`/
  `dry_run` como dice la tabla del §4. Es necesario: quien corre el import es
  la plataforma (`ctx.isPlatform`, vía `allowNoTenant`), que normalmente no
  tiene bar propio — no hay otro lugar de donde tomar a qué bar va el menú.
- **Las respuestas de `orders`/`stations` devuelven filas `{id, data}` sin
  aplanar**; solo `catalog` aplana server-side (`shapeRow`). `src/components/
  orders/helpers.js` y `src/components/stations/stationHelpers.js` cada uno
  trae su propio `flattenRow`/`flattenEvent` — duplicado a propósito (cada
  agente de UI es dueño de su carpeta, contrato §5), documentado en el
  comentario de cada copia. No se unifica en esta pasada: cambiar la forma de
  respuesta de `orders`/`stations` para que coincida con `catalog` es un
  cambio de contrato con más superficie de la que esta revisión debía tocar.
- **`orders.cancelOrder` SÍ persiste el motivo** — `Order.cancel_reason`
  (campo agregado 2026-09-28) — y **`orders.cancelItem`/`cancelOrder`
  registran quién** vía `OrderItem.cancelled_by` (campo agregado el mismo
  día), cerrando el "queda registrado quién y por qué" del §3 que antes solo
  se cumplía a medias.
- **El 409 `table_busy` de `orders.open`/`orders.moveTable` ahora manda
  `order_id` estructurado**, no solo dentro del texto del mensaje —
  `_guard.ts`'s `HttpError` ganó un `extra` opcional que `handle()` mezcla en
  el cuerpo JSON (scripts/templates/_guard.ts, regenerado a las tres copias).
- **`Product.variants[].cost` sigue sin un candado de RLS propio** — un lock
  de campo no puede aislar un sub-campo dentro de un array, así que en vez de
  eso se bloqueó la lectura de `Product` entero a la plataforma (§1 más
  abajo, revisado). `variants[].price` (que si necesita llegar a cualquier
  operador) solo se sirve vía `catalog.listProducts`, nunca por lectura
  directa — confirmado por grep que nada en `src/` lee `Product` directo
  salvo `SuperAdmin.jsx` (plataforma).
- **`SuperAdmin.jsx` escribe `WineBar.billing_status` directo**
  (`base44.entities.WineBar.update`), lo que a primera vista contradice el
  "Ninguna página escribe entidades directo" del §1. Es una excepción
  deliberada: esa página es exclusiva de la plataforma (`user.role ===
  'admin'`, comprobado tanto en el cliente como por el `rls.write:
  {role:admin}` del propio campo en `WineBar.jsonc`), pre-existente al
  prototipo, y el campo que toca ya está bloqueado a ese mismo rol en RLS —
  no hay bypass posible, solo una redacción del §1 que no contempló páginas
  de plataforma. El §1 queda así: "Ninguna página del bar escribe entidades
  directo; páginas exclusivas de la plataforma (SuperAdmin) pueden, siempre
  que el campo que tocan ya esté bloqueado por RLS al mismo rol."

## 6. Pruebas y verificación

- Cada API agente escribe lógica pura (cálculos, validaciones, transiciones
  de estado) en `handlers/_logic.ts` **sin imports** y la prueba con
  `deno test` en `base44/tests/`. Deno: binario en
  `$SCRATCH/deno` (lo baja Base de
  `https://github.com/denoland/deno/releases/download/v2.9.5/deno-x86_64-unknown-linux-gnu.zip`).
  `deno.land`/`jsr.io` están bloqueados: pruebas sin imports externos
  (`Deno.test` + `throw`), igual que `machinery_sales_fields_test.ts` de StockFlow.
- Todos: `npm run lint`, `npm run build`, `npm run validate:rls`,
  `npm run validate:tenant-roles`, `npm run check:guards` en verde.
- No se despliega nada. No se hace commit (el orquestador revisa y commitea).
