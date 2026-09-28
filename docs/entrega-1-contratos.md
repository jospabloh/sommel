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
- Inquilino: `User.data.tenant_id`; rol del bar: `User.data.app_role`
  (`bar_admin` | `staff`). Built-in `role: admin` = dueño de la plataforma.
- Ninguna página escribe entidades directo (`base44.entities.X.create/update/delete`
  prohibido en `src/`). Lecturas y `subscribe()` directas sí, salvo `Product`
  para quien no tiene `Menú:ver_costos` (usar `catalog.listProducts`).
- Llamada desde el cliente:
  `base44.functions.invoke('<endpoint>', { action: '<accion>', ...payload })`.
  Respuesta `{ ok: true, ... }` o error HTTP con `{ error: '<mensaje en español>', code: '<snake_case>' }`.
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
