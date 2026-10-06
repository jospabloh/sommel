# Entrega 2: contratos entre agentes

Alcance (propuesta, semanas 4-5): **cobro, turno y corte al correo, reportes,
inventario y ticket impreso desde la laptop de caja**. Criterio de cierre:
un turno de prueba cuyo corte se compara contra Loyverse. Este documento es la
fuente de verdad entre agentes; todo lo de `docs/entrega-1-contratos.md` §1
(convenciones, forma plana de los registros, 401, redacción de costo) y §2
(guardia común y orden obligatorio) **sigue vigente** y no se repite aquí.

Regla de alcance: se construye solo lo que la propuesta promete. Nada de
integraciones, cajón eléctrico, facturación CFDI, anticipos de arcones ni
asistencia del personal.

## 0. Decisiones que dependen de Alby (defaults seguros, todos reversibles)

| Pendiente | Default construido | Dónde se cambia sin código |
|---|---|---|
| IVA incluido o no | Los precios de la carta son el precio final. El ticket **no** desglosa IVA; muestra la leyenda "Este ticket no es una factura". | Si ella dice que no incluyen IVA, es un cambio de código chico (desglose en ticket y reportes). No se construye antes. |
| Propina | Opcional, en monto o porcentaje, la captura quien cobra. Botones rápidos 10 / 15 / 20 % para quien cobra (2026-10-06); nada se sugiere ni se imprime al cliente. | — |
| Descuentos y cortesías | Existen, con motivo obligatorio. Solo `bar_admin` por default. | `PermissionProfile` (clave `Cobro:descuento`) |
| Formas de pago / vales | Default: Efectivo, Tarjeta, Transferencia. Vales u otras se agregan en Ajustes. | Ajustes → formas de pago |
| Correos del corte | Vacío. Sin destinatarios el corte se guarda y queda `email_status: fallido` con motivo `sin_destinatarios`; se reenvía después. | Ajustes → correos del corte |
| Permisos del equipo | Tabla §2 abajo. | `PermissionProfile` |
| Cerrar turno con órdenes abiertas | **No se permite** (409 `open_orders`): se cobran o cancelan antes. | Confirmar con Alby |

## 1. Convenciones nuevas

- **Zona horaria del bar:** Aguascalientes, UTC-6 fijo todo el año (México
  quitó el horario de verano en 2022). Constante `BAR_UTC_OFFSET_MIN = -360`
  en `_guard_logic.ts`. "Día" en reportes = 00:00 a 23:59 hora local.
- **Una sola `Shift` abierta por bar.** Todo `Payment` y `CashMovement` lleva
  el `shift_id` del turno abierto; sin turno abierto, cobrar responde 409
  `no_open_shift` ("Abre el turno antes de cobrar").
- **Líneas de impresión** (`PrintJob.lines`), formato único que produce el
  servidor y la estación de impresión solo pinta:
  `[{ text: string, align?: 'left'|'center'|'right', bold?: boolean, size?: 'normal'|'big' }]`.
  Papel de 58 mm = **32 columnas** en fuente monoespaciada. Para renglones de
  "concepto ... importe" el servidor usa `padLine(left, right, 32)` de
  `_guard_logic.ts`. Separador: `{ text: '-'.repeat(32) }`.
- **Idempotencia**: toda acción que crea dinero o inventario recibe o deriva
  una llave, busca antes de crear y **relee después de crear**; si hay más de
  una fila con la misma llave, sobrevive la de `created_date` más vieja (id
  como desempate) y las demás se neutralizan (pagos: `voided_at` +
  `void_reason: 'duplicado'`; movimientos: `qty: 0` + `reason: 'duplicado'`),
  nunca se borran. Helper puro `pickSurvivor(rows)` en `_guard_logic.ts`.

## 2. Permisos nuevos (`src/lib/permissionRegistry.js`)

| Clave | bar_admin | staff | Cubre |
|---|---|---|---|
| `Cobro:cobrar` | ✓ | ✓ | pagos, propina, dividir, pedir ticket |
| `Cobro:descuento` | ✓ | ✗ | descuentos y cortesías |
| `Cobro:anular_pago` | ✓ | ✗ | anular un pago (reabre la orden) |
| `Turno:operar` | ✓ | ✓ | abrir, salida de efectivo, cerrar a ciegas |
| `Turno:ver_corte` | ✓ | ✗ | ver esperado/diferencia, cortes anteriores, reenviar correo |
| `Inventario:ver` | ✓ | ✓ | existencias y alertas (costo redactado sin `Menú:ver_costos`) |
| `Inventario:merma` | ✓ | ✓ | registrar merma con motivo |
| `Inventario:editar` | ✓ | ✗ | insumos, entradas, conteos, ligar productos |
| `Impresion:operar` | ✓ | ✓ | estación de impresión, reimprimir |
| `Reportes:ver` | ✓ | ✗ | reportes |
| `Ajustes:editar` | ✓ | ✗ | datos del ticket, formas de pago, correos del corte |

Costo y utilidad en **cualquier** respuesta siguen gateados por
`Menú:ver_costos` (D7).

## 3. Cambios de esquema (una sola `entities push` que corre José)

Entidades existentes (el orquestador no puede empujarlas; se listan para el
push). Todo es **aditivo**:

| Entidad | Cambio |
|---|---|
| `WineBar` | `+ payment_methods: array` de `{ key, label, is_cash: bool, active: bool }` |
| `Order` | `+ discount_pct: number\|null`, `+ tip_pct: number\|null`, `+ paid: integer`, `+ closed_by: string` |
| `Payment` | `+ method_label: string`, `+ voided_by: string`, `+ void_reason: string` |
| `Shift` | `+ summary: object` (foto congelada del corte), `+ email_error: string` |
| `PrintJob` | `+ title: string`, `+ error: string` |
| `Product` | `+ inventory_qty: number` (cuánto descuenta una unidad vendida; las variantes lo llevan dentro de `variants[].inventory_qty`) |
| `InventoryItem` | `unit_cost` gana `rls.read` solo plataforma (igual que `OrderItem.unit_cost`) |
| `InventoryMovement` | `unit_cost` gana `rls.read` solo plataforma |
| `OrderItem` | (ya en el repo) `unit_cost` acepta `null` |

Sin entidades nuevas.

## 4. Lógica pura compartida (agente Base, en `scripts/templates/_guard_logic.ts`)

Va en la plantilla para que `orders` y `payments` calculen lo mismo:

```ts
computeOrderTotals(items, { discount_kind, discount_pct, discount, tip_pct, tip })
  // subtotal = Σ unit_price*qty de renglones no cancelados
  // cortesia → discount = subtotal; discount_pct → round(subtotal*pct/100); si no, min(discount, subtotal)
  // tip_pct → round((subtotal-discount)*pct/100); si no, tip ?? 0
  // total = subtotal - discount + tip      → { subtotal, discount, tip, total }
pickSurvivor(rows)                         // más viejo por created_date, id desempate
padLine(left, right, width = 32)           // corta left si no cabe
localDayRange(dateStr 'YYYY-MM-DD')        // → { fromISO, toISO } en UTC para el día local
localHour(iso)                             // 0-23 hora local
splitEqual(amount, parts)                  // reparte centavos, sobrante a las primeras partes
```

`orders/handlers/_shared.ts` pasa a usar esta `computeOrderTotals` (conserva
descuento y propina al agregar/cancelar renglones). `orders.cancelItem`/
`removeItem` responden 409 `paid_exceeds_total` si el nuevo total quedaría por
debajo de lo pagado. `orders.cancelOrder` ignora pagos anulados (`voided_at`).

## 5. Endpoints nuevos

Todos con `_guard.ts` (se agregan a `TARGET_DIRS`), router `handle()` por
`action`, orden obligatorio auth → loadOwned → permiso → `requireWritable`
(solo escrituras) → validación → escritura con `svc`. Lecturas sin billing
gate.

### `payments` (agente Cobro)
| action | payload | respuesta | permiso |
|---|---|---|---|
| `summary` | `{ order_id }` | `{ order, items, payments, remaining, methods }` — `items` con costo redactado; `methods` = formas activas del bar | `Cobro:cobrar` |
| `applyDiscount` | `{ order_id, kind: 'descuento'\|'cortesia'\|'ninguno', pct?, amount?, reason }` | `{ order }` — motivo obligatorio salvo `ninguno`; 409 `has_payments` si ya hay pagos vigentes | `Cobro:descuento` |
| `setTip` | `{ order_id, pct?, amount? }` (ninguno = quitar) | `{ order }` — 409 `has_payments` | `Cobro:cobrar` |
| `splitPreview` | `{ order_id, mode: 'equal', parts }` o `{ order_id, mode: 'items', item_ids }` | `{ amounts: [cents] }` o `{ amount }` — sin escribir; `items` prorratea descuento y propina | `Cobro:cobrar` |
| `addPayment` | `{ order_id, method, amount, received?, split_label?, idempotency_key }` | `{ payment, order, remaining, change, closed: bool }` | `Cobro:cobrar` |
| `voidPayment` | `{ payment_id, reason }` | `{ payment, order }` — solo si el turno del pago sigue abierto; si la orden estaba `cobrada` vuelve a `abierta` | `Cobro:anular_pago` |
| `requestTicket` | `{ order_id }` | `{ job }` — crea `PrintJob` `ticket` | `Cobro:cobrar` |

Reglas de `addPayment`:
- `method` debe existir y estar activo en `WineBar.payment_methods`
  (default §0 si el bar no tiene lista). `method_label` se congela.
- `amount` entero > 0 y ≤ lo que falta. Si el método es `is_cash`,
  `received ≥ amount` y `change = received - amount` (calculado por el
  servidor). Si no es efectivo, `received`/`change` no se guardan.
- Llave idempotente: misma `idempotency_key` en el mismo bar → devuelve el
  pago existente sin crear otro. Reconciliación post-escritura con
  `pickSurvivor`.
- Cuando `Σ pagos vigentes ≥ total`: `Order.status = cobrada`, `closed_at`,
  `closed_by`, `shift_id`, `paid`; libera mesas (`BarTable.status`
  recalculado igual que `orders`) y **descuenta inventario** (§5 inventario,
  movimientos `venta` con llave `venta:<order_item_id>` y `merma` con llave
  `merma:<order_item_id>` para cancelados con `prepared: true`). Una falla
  al descontar inventario **no** revierte el cobro: se registra y la
  respuesta trae `inventory_warning`.
- No crea ticket solo: el ticket se pide (`requestTicket`) desde la pantalla
  de cobro; la UI ofrece "Imprimir ticket" al cerrar.

Ticket (`PrintJob.kind = ticket`, `dedupe_key = ticket:<order_id>:<paid>:<total>`,
`title = 'Ticket Mesa 4'` o `'Ticket Para llevar · Ana'`): encabezado del bar
(`name`, `ticket_header`, `rfc` si hay), fecha y hora local, mesa o cliente,
renglones (`2 x Tabla chica ... $560.00`, modificadores debajo con sangría),
subtotal, descuento o cortesía con su motivo, propina, **total**, cada pago
(`Efectivo $500.00`, recibido y cambio si aplica), `ticket_footer`, y al final
`Este ticket no es una factura`.

### `shifts` (agente Turno)
| action | payload | respuesta | permiso |
|---|---|---|---|
| `current` | `{}` | `{ shift \| null, cash_outs, totals_by_method }` — sin `expected_cash`/`difference` si falta `Turno:ver_corte` | `Turno:operar` |
| `open` | `{ opening_float }` | `{ shift }` — 409 `shift_open` si ya hay uno | `Turno:operar` |
| `addCashOut` | `{ amount, reason, idempotency_key }` | `{ movement }` — motivo obligatorio; `CashMovement.amount` se guarda **negativo** (salida) | `Turno:operar` |
| `close` | `{ counted_cash, comment? }` | `{ shift, email_status }` — 409 `open_orders` con `count`; si `difference ≠ 0` y no hay `comment` → 409 `comment_required` **sin revelar cifras**; respuesta con cifras solo con `Turno:ver_corte` | `Turno:operar` |
| `list` | `{ limit? }` | `{ shifts }` cerrados, más reciente primero | `Turno:ver_corte` |
| `resendEmail` | `{ shift_id }` | `{ email_status }` | `Turno:ver_corte` |
| `printCorte` | `{ shift_id }` | `{ job }` — `PrintJob` `corte`, `dedupe_key = corte:<shift_id>` (reimprimir va por `printing.reprint`) | `Turno:ver_corte` |

Cálculo del cierre (servidor, **después** de recibir lo contado):
`expected_cash = opening_float + Σ(amount de pagos vigentes en efectivo del turno) + Σ(CashMovement.amount)`;
`difference = counted_cash - expected_cash`. `summary` congela: ventas por
forma de pago, propinas, descuentos y cortesías (conteo + monto), renglones
cancelados (conteo), órdenes cobradas, ticket promedio, fondo, salidas con
motivo, esperado, contado, diferencia y comentario.

Correo: `svc.integrations.Core.SendEmail({ to, subject, body })` una vez por
destinatario de `WineBar.corte_emails`. Asunto `Corte de caja · <bar> · <fecha local>`.
Cuerpo en texto claro legible en celular, sin costos ni utilidad. Éxito →
`email_status: enviado`, `email_sent_at`; cualquier falla → `fallido` +
`email_error` y el cierre **sí** queda guardado (el turno no se reabre por
un correo). Sin destinatarios → `fallido`, `email_error: 'sin_destinatarios'`.

### `inventory` (agente Inventario)
| action | payload | respuesta | permiso |
|---|---|---|---|
| `list` | `{}` | `{ items, low: [ids] }` — `unit_cost` redactado sin `Menú:ver_costos`; `low` = `stock ≤ low_threshold` | `Inventario:ver` |
| `movements` | `{ item_id, limit? }` | `{ movements }` — costo redactado | `Inventario:ver` |
| `upsertItem` | `{ id?, name, unit: 'pieza'\|'botella'\|'g'\|'ml', low_threshold?, unit_cost? }` | `{ item }` — `stock` **no** se acepta; `unit_cost` solo con `Menú:ver_costos`, si no llega se conserva | `Inventario:editar` |
| `addEntry` | `{ item_id, qty, unit_cost?, reason?, idempotency_key }` | `{ movement, item }` — `qty > 0`; `unit_cost` (con permiso) actualiza el costo del insumo | `Inventario:editar` |
| `addWaste` | `{ item_id, qty, reason, idempotency_key }` | `{ movement, item }` — motivo obligatorio; guarda `qty` negativo y el costo vigente | `Inventario:merma` |
| `count` | `{ item_id, counted, reason?, idempotency_key }` | `{ movement, item }` — movimiento `conteo` con `qty = counted - stock` | `Inventario:editar` |
| `linkProduct` | `{ product_id, inventory_item_id \| null, inventory_qty?, variant_qtys?: { [variantKey]: number } }` | `{ product }` — pone `track_inventory` | `Inventario:editar` |

`stock` nunca se escribe desde el cliente: tras cada movimiento el servidor
lo **recalcula como Σ qty** de los movimientos del insumo (converge aunque
dos escrituras se crucen). Descuento por venta: lo hace `payments` al cerrar
la orden (§5 `payments`), con las mismas llaves; `inventory` no expone acción
de venta.

### `printing` (agente Impresión)
| action | payload | respuesta | permiso |
|---|---|---|---|
| `queue` | `{ include_done?: bool }` | `{ jobs }` — pendientes, reclamados y fallidos; con `include_done` los últimos 20 impresos | `Impresion:operar` |
| `claimNext` | `{ device_id }` | `{ job \| null }` — el `pendiente` más viejo (o `reclamado` hace > 2 min: vuelve a la cola); marca `reclamado`, `claimed_by = device_id`, `attempts+1`, **relee**: si `claimed_by` no es este dispositivo, `{ job: null }` | `Impresion:operar` |
| `markPrinted` | `{ job_id, device_id }` | `{ job }` — solo quien lo reclamó | `Impresion:operar` |
| `markFailed` | `{ job_id, device_id, error }` | `{ job }` — `fallido`; se reintenta con `retry` | `Impresion:operar` |
| `retry` | `{ job_id }` | `{ job }` — `fallido` → `pendiente` | `Impresion:operar` |
| `reprint` | `{ job_id }` | `{ job }` — nuevo trabajo con `reprint_of`, mismas líneas, `dedupe_key = reprint:<job_id>:<n>` | `Impresion:operar` |

### `reports` (agente Reportes)
| action | payload | respuesta | permiso |
|---|---|---|---|
| `summary` | `{ from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }` (máx. 92 días) | ver abajo | `Reportes:ver` |

Periodo = órdenes `cobrada` con `closed_at` dentro del rango local.
Comparativo = mismo número de días inmediatamente antes. Respuesta:
`{ range, previous_range, totals: { sales, orders, avg_ticket, tips, discounts, courtesies, items_sold }, previous_totals, by_product, by_category, by_person (quien abrió la orden), by_method, by_hour (0-23), top_products (10), cancellations: { count, items: [{ name, qty, reason, cancelled_by, at }] }, courtesies: [...], waste: { count, items }, cash_differences: [{ shift_id, closed_at, difference, comment }], costs? }`.
`costs` (solo con `Menú:ver_costos`): `{ cost, profit, margin_pct, uncosted_items }`;
los renglones con costo `null` **no** cuentan como costo 0 — se reportan en
`uncosted_items` y la utilidad se calcula solo sobre renglones con costo.
Ventas = Σ total de las órdenes (incluye propina) y además `sales_net` sin
propina. Nombres de personas: `User.full_name` o el correo, leídos con `svc`.

### `settings` (agente Base)
| action | payload | respuesta | permiso |
|---|---|---|---|
| `get` | `{}` | `{ bar: { name, address, rfc, ticket_header, ticket_footer, payment_methods, corte_emails, prep_goal_kitchen_min, prep_goal_bar_min } }` — `payment_methods` con el default §0 si está vacío | `Cobro:cobrar` o `Ajustes:editar` |
| `update` | cualquier subconjunto de esos campos salvo `name` | `{ bar }` — valida correos, métodos (`key` único, slug), al menos un método activo, siempre existe uno `is_cash` | `Ajustes:editar` |

## 6. Pantallas

| Ruta | Página | Quién la ve |
|---|---|---|
| `/orden/:orderId` | Botón **Cobrar** abre `CobroPanel` (hoja inferior en móvil) | `Cobro:cobrar` |
| `/turno` | Turno y corte | `Turno:operar` |
| `/inventario` | Inventario | `Inventario:ver` |
| `/reportes` | Reportes | `Reportes:ver` |
| `/ajustes` | Ajustes del bar | `Ajustes:editar` |
| `/estacion/impresion` | Estación de impresión (laptop de caja) | `Impresion:operar` |

- **Cobro** (pantalla 2 de la propuesta): total grande, descuento/cortesía con
  motivo, propina, dividir (partes iguales o por platillos), formas de pago
  en botones, teclado de efectivo con "recibido" y **cambio** que el
  servidor confirma, lista de pagos con anular (si hay permiso), "Imprimir
  ticket". La `idempotency_key` se genera **una vez por intento** en el
  cliente (`crypto.randomUUID()`) y se reutiliza en reintentos de ese mismo
  intento; se regenera solo tras éxito o al cambiar monto/método.
- **Turno** (pantalla 4): sin turno → abrir con fondo; con turno → ventas del
  turno por forma de pago (sin esperado si no hay `Turno:ver_corte`), salidas
  de efectivo con motivo, cerrar: pide **solo lo contado** (a ciegas), luego
  comentario si el servidor dice `comment_required`; al terminar muestra el
  estado del correo y, con permiso, el corte y "Reenviar correo" /
  "Imprimir corte". Historial de cortes con permiso.
- **Inventario** (pantalla 10): lista con existencias y alerta de bajo stock
  arriba, entrada, merma, conteo, alta de insumo, ligar productos del menú.
- **Reportes** (pantalla 5): Hoy / Esta semana / Rango; tarjetas con
  comparativo (flecha y %), tablas por producto, categoría, persona, forma
  de pago, hora (barras simples en CSS, sin librería nueva), cancelaciones,
  cortesías, mermas, diferencias de caja; costo y utilidad solo con permiso.
- **Estación de impresión**: pensada para dejarse abierta en la laptop.
  `device_id` estable en `localStorage` (try/catch). Se suscribe a
  `PrintJob` y además sondea cada 10 s (los websockets pueden fallar);
  reclama, pinta el trabajo en un área `@media print` de 58 mm (48 mm
  imprimibles, monoespaciada, 32 columnas), llama `window.print()`, y
  confirma `markPrinted`. Interruptor "Imprimir automáticamente" (default
  apagado hasta la prueba en su laptop); en manual, cada trabajo tiene
  botón "Imprimir". Muestra pendientes, fallidos (reintentar) y últimos
  impresos (reimprimir). Instrucciones visibles de modo kiosco
  (`--kiosk-printing`). Nada se reimprime solo al reconectar.
- **Ajustes**: datos del ticket, formas de pago (agregar "Vales", activar/
  desactivar), correos del corte.
- Todo en español, tema claro y oscuro con los tokens existentes, 390 px y
  tablet, sin colores fijos nuevos, sin em dashes en textos al usuario.
- Layout: navegación agrega Turno, Inventario, Reportes, Ajustes, Impresión
  según permiso.

## 6b. Desviaciones

Registradas por el agente Base. Todas son aditivas; ninguna rompe la firma del
contrato.

- **`localDayRange(dateStr)`**: `toISO` es la **medianoche local siguiente,
  exclusiva** (`[fromISO, toISO)`), no 23:59:59.999. Filtrar con `>= fromISO` y
  `< toISO`. Para 2026-09-28: `2026-09-28T06:00:00.000Z` a `2026-09-29T06:00:00.000Z`.
- **`computeOrderTotals(items, opts)`** devuelve `{ subtotal, discount, tip, total }`.
  Precedencia del descuento: `discount_kind: 'cortesia'` gana; luego
  `discount_pct` (si es número >= 0); si no, `discount` capado al subtotal.
  Propina: `tip_pct` sobre `subtotal - discount`; si no, `tip`. Los renglones
  cancelados no cuentan. La versión local de `orders/handlers/_logic.ts` se
  eliminó (quedaba muerta); sus pruebas ahora importan la compartida.
- **Helpers extra** en `_guard_logic.ts` (re-exportados por `_guard.ts`):
  `activePaymentsTotal(payments)` (suma de pagos sin `voided_at`),
  `localDateString(iso)` ('YYYY-MM-DD' local, útil para el asunto del correo),
  `DEFAULT_PAYMENT_METHODS`, tipo `PaymentMethodDef`.
- **`pickSurvivor(rows)`** devuelve la fila (o `null` si no hay), no el id.
- **`PrintJob.lines`**: el esquema tenía `items: string`; se cambió a objetos
  `{ text, align?, bold?, size? }` para que coincida con §1. Sin datos previos.
- **`Product.stock_unit`** gana `"ml"` en el enum (§5 `inventory.upsertItem`
  admite `ml`). `Product.variants[].inventory_qty` se agregó al esquema de la
  variante, como pide §3.
- **`InventoryItem.unit_cost` / `InventoryMovement.unit_cost`** ahora son
  `integer | null` además del candado de lectura solo plataforma.
- **`settings.update`** rechaza `name` y cualquier campo desconocido con 400
  `field_not_editable`. Reglas extra de `payment_methods`: una forma existente
  no se puede quitar (se desactiva; los pagos viejos conservan su nombre) ni
  cambiar entre efectivo y no efectivo (`method_removed`, `cash_flag_locked`);
  `key` se genera del nombre si no llega. `rfc` se valida (12 o 13
  caracteres) y `corte_emails` admite hasta 10. Las metas de preparación se
  aceptan en `update` pero Ajustes no las muestra todavía.
- **`settings.get`** devuelve además `address`, `rfc` y `name`; no hay billing gate.
- **`orders.updateItem`** no revisa `paid_exceeds_total` (el contrato solo
  nombra `cancelItem` y `removeItem`); `cancelOrder` ahora solo bloquea con pagos
  vigentes (`voided_at` vacío).
- **Nav**: las entradas se filtran por `can()` (antes por rol). `Staff` sigue
  siendo solo `bar_admin`/plataforma. Rutas nuevas protegidas con
  `RequirePermission` en `App.jsx`.
- **Stubs**: `payments`, `shifts`, `inventory`, `printing`, `reports` traen un
  `entry.ts` mínimo (`handle(req, {})`) para que el conteo de funciones y
  `check:guards` pasen; cada agente lo reemplaza. Endpoints totales: 12
  (techo 40).

## 7. Dueño de cada archivo

| Agente | Archivos |
|---|---|
| **Base** | `scripts/templates/_guard*.ts`, `scripts/generate-guards.mjs`, copias `_guard*.ts`, `src/lib/permissionRegistry.js`, `src/App.jsx`, `src/components/Layout.jsx`, `base44/entities/*.jsonc`, `base44/functions/orders/**` (solo §4), `base44/functions/settings/**`, `src/pages/Ajustes.jsx`, `src/components/settings/**`, esqueletos de `Turno.jsx`/`Inventario.jsx`/`Reportes.jsx`/`Impresion.jsx`, `base44/tests/guard_logic_test.ts`, `base44/tests/settings_*_test.ts`, `docs/entrega-2-contratos.md` §6b |
| **Cobro** | `base44/functions/payments/**`, `src/components/payments/**`, **en `src/pages/Orden.jsx` solo** el botón Cobrar y el montaje del panel, `base44/tests/payments_*_test.ts` |
| **Turno** | `base44/functions/shifts/**`, `src/pages/Turno.jsx`, `src/components/shifts/**`, `base44/tests/shifts_*_test.ts` |
| **Inventario** | `base44/functions/inventory/**`, `src/pages/Inventario.jsx`, `src/components/inventory/**`, `base44/tests/inventory_*_test.ts` |
| **Impresión** | `base44/functions/printing/**`, `src/pages/Impresion.jsx`, `src/components/printing/**`, `base44/tests/printing_*_test.ts` |
| **Reportes** | `base44/functions/reports/**`, `src/pages/Reportes.jsx`, `src/components/reports/**`, `base44/tests/reports_*_test.ts` |

Contrato entre Cobro e Inventario: la forma del `InventoryMovement` de venta
y merma está fija en §5; el recálculo de `stock` usa la regla Σ qty. Cobro lo
implementa por su cuenta (Base44 no comparte código entre funciones).

## 8. Pruebas y verificación

Igual que Entrega 1 §6: lógica pura en `handlers/_logic.ts` sin imports con
pruebas `deno test` en `base44/tests/` (binario de Deno en el scratchpad;
`deno.land`/`jsr.io` bloqueados). Todos: `npm run lint`, `npm run build`,
`npm run validate:rls`, `npm run validate:tenant-roles`, `npm run check:guards`
en verde. No se despliega nada. No se hace commit.

### Correcciones de revisión (fix agent)

- **`orders.updateItem`** ahora sí responde 409 `paid_exceeds_total` al bajar
  `qty` si el total quedaría bajo lo pagado (sustituye la desviación anterior).
- **`orders.mergeOrders`** responde 409 `has_payments` si la comanda de origen
  tiene pagos vigentes (misma regla que `cancelOrder`).
- **`CashMovement.idempotency_key`** se agrega al esquema (aditivo; entra en el
  `entities push`). `amount` se guarda negativo.
- **`settings.update`** usa `ctx.bar` (WineBar no tiene `tenant_id`, `loadOwned`
  siempre daba 404).
- **`addPayment`**: si dos cajas con llaves distintas sobrepagan, el pago más
  nuevo se anula (`voided_by: 'sistema'`, `void_reason: 'excede_total'`) y
  responde 409 `amount_exceeds_remaining`.
- **Inventario al cobrar**: no se genera `merma:<id>` si ya existe un
  `venta:<id>` con qty distinta de 0 (reabrir y volver a cerrar no descuenta
  dos veces); el recálculo de `stock` pagina de a 500 como `inventory`.
- **`payments.findOpenShift`** toma el turno abierto más VIEJO, igual que `shifts`.
- **`Orden.jsx`** muestra `order.total` del servidor.
- **Cierre a ciegas, cerrado por el orquestador**: sin `Turno:ver_corte`,
  `shifts.current` manda `amount: null` en las formas de pago en efectivo y
  `sales_total: null` (el total permitía despejar el efectivo restando). Se
  conservan conteos, formas no efectivo, fondo y salidas, que por sí solos no
  dan el esperado. La pantalla muestra "Se revisa en el corte".
- No se reimplementó la reversa de inventario al anular un pago (desviación 7 sigue).
