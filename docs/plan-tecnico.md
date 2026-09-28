# Sommel para Vindima: plan técnico interno

Documento interno. Nada de aquí se le promete al cliente: la promesa es la
propuesta que Alby aceptó el 2026-09-27. Este plan dice **cómo** se cumple.

## 0. Punto de partida (leído el 2026-09-28)

- **App Base44 `6ab41c2a89f592a0eca074d2`** ("Sommel"). Su código vive en el
  git propio de Base44; `main` de este repo coincide archivo por archivo con
  lo que tiene `base44/` en el espacio de trabajo de Base44 (se comparó el
  tamaño de cada archivo el 2026-09-28).
- **El esquema desplegado ya trae los bloqueos del módulo 24** (PR #1 a #4):
  `User.tenant_id`/`app_role` con `write:false`, `WineBar.subscription_status`
  y `owner_id` solo para la plataforma, alta de bar en `createWineBar`.
- **Datos vivos:** 1 `User` (el dueño de la plataforma, `role: admin`), sin
  bares ni clientes. Rediseñar las entidades no rompe a nadie hoy; a partir
  de que Vindima tenga datos, todo cambio de esquema sigue la regla del
  módulo 4 (ampliar primero, nunca estrechar a medias).
- **Lo que hay es un prototipo genérico** ("POS SaaS para wine bars"): la
  venta se cobra de una vez (`processSale` crea la orden ya pagada), no hay
  comandas abiertas, estaciones, cobro con varias formas, turnos ni
  impresión. Se conserva lo que ya cumple el estándar y se reemplaza el
  resto.

## 1. Decisiones de arquitectura

| # | Decisión | Por qué |
|---|---|---|
| D1 | Inquilino = `WineBar`; puntero `User.data.tenant_id` (se conserva el nombre) | Ya está bloqueado y validado por el módulo 24. Renombrar a `business_id` solo mueve riesgo |
| D2 | Roles del bar en `User.data.app_role` (`bar_admin` \| `staff`); `role` integrado queda en `user` | Diseño A del módulo 24. `admin` integrado es solo de la plataforma |
| D3 | **Cada persona entra con su propia cuenta** (correo y contraseña) | La propuesta promete "accesos separados para ti y tu equipo". No hay login por PIN; el PIN solo existe si confirma "checar hora de ingresos" = asistencia |
| D4 | **Toda escritura pasa por una Safe function**; el cliente nunca escribe entidades directo | Módulo 3. El servidor recalcula precios, totales, cambio y diferencias de caja |
| D5 | Renglones de la orden como **entidad aparte** (`OrderItem`), uno por platillo, agregados por el servidor | Dos meseros agregando a la misma mesa no se pisan (un arreglo `items[]` se sobrescribe completo) |
| D6 | Precio y **costo congelados** en el `OrderItem` al agregarlo | La utilidad de un día viejo no cambia si mañana sube el costo |
| D7 | **Costo nunca sale al navegador** de quien no tiene `Menú:ver_costos`; reportes se calculan en el servidor | Lección de StockFlow (`MachinerySale.cost`): ocultar en el JSX no protege nada |
| D8 | **Cada cobro lleva `idempotency_key`** generada en el cliente; el servidor no crea dos pagos con la misma llave y reconcilia después de escribir | Doble toque o reintento por red no cobran dos veces (lección `syncCashSaleToPettyCash`) |
| D9 | **Impresión por cola**: `PrintJob` + estación de impresión en la laptop de caja | La Xprinter XP-58IIH es solo USB. La tablet no imprime |
| D10 | Tiempo real con `base44.entities.X.subscribe()` | Cocina, barra y la laptop ven lo nuevo sin recargar |
| D11 | Correo del corte con `integrations.Core.SendEmail`; Resend solo si falla en la semana 0 | Aprobado por José. No asumir gastos |
| D12 | Pocas funciones con router por `action` | Módulo 11: tope de 50, `maxFunctions: 40` |
| D13 | Inventario sencillo propio, sin integrar con StockFlow | Decidido con José. Se reutilizan sus lecciones (movimientos, idempotencia) |
| D14 | Stripe fuera: se quitan `@stripe/*` de `package.json` | Pagos del portafolio = Mercado Pago/transferencia, manual en Mission Control |

## 2. Entidades

Todas con la forma de cuatro operaciones del módulo 4:
`$or[{"data.tenant_id":"{{user.data.tenant_id}}"},{"user_condition":{"role":"admin"}}]`,
salvo donde se indica. Escritura directa del cliente **no se usa**; donde la
regla la permitiría, la Safe function es la única que escribe.

| Entidad | Campos clave | Notas |
|---|---|---|
| `WineBar` | name, address, rfc, ticket_header, ticket_footer, **`billing_status`** (`trial`\|`active`\|`view_only`\|`suspended`), trial_end_at, current_period_end, plan, corte_emails[], prep_goal_kitchen_min, prep_goal_bar_min, service_hours | Reemplaza `subscription_status`. Campos de licencia `rls.write` solo plataforma, con descripción del porqué (módulo 19) |
| `User` | tenant_id, app_role | Sin cambios de bloqueo |
| `Category` | name, sort, station_default | |
| `Product` | name, category_id, station (`kitchen`\|`bar`\|`none`), price, **cost**, variants[] (tamaño + precio + costo), modifiers[] (sin costo), active, seasonal, track_inventory, stock_unit (`pieza`\|`botella`\|`g`), inventory_item_id | Tablas chica/mediana/grande = variantes |
| `InventoryItem` | name, unit, stock, low_threshold, unit_cost | Botellas y tisanas a granel (gramos). Separado de `Product` para que "copa" y "botella" puedan descontar del mismo vino más adelante sin migrar |
| `InventoryMovement` | item_id, type (`entrada`\|`venta`\|`merma`\|`conteo`\|`devolucion`), qty, unit_cost, reason, order_item_id, idempotency_key, created_by | El stock se recalcula de movimientos; nunca se edita a mano |
| `BarTable` | name, seats, zone, x, y, status | Mapa de mesas |
| `Order` | type (`mesa`\|`llevar`), table_ids[], customer_name, status (`abierta`\|`cobrada`\|`cancelada`), opened_by, opened_at, closed_at, subtotal, discount, discount_reason, discount_kind (`descuento`\|`cortesia`), tip, total, shift_id | Totales solo los escribe el servidor |
| `OrderItem` | order_id, product_id, variant, name, unit_price, unit_cost, qty, modifiers[], notes, station, status (`nuevo`\|`enviado`\|`listo`\|`entregado`\|`cancelado`), sent_at, ready_at, cancel_reason, prepared (bool, para merma al cancelar), created_by | Hora de entrada y de salida por platillo (promesa "Cocina y barra") |
| `Payment` | order_id, shift_id, method, amount, received, change, split_label, **idempotency_key**, created_by, voided_at | Métodos configurables por bar (vales incluidos) |
| `Shift` | opened_at, opened_by, opening_float, closed_at, closed_by, counted_cash, expected_cash, difference, close_comment, email_status, email_sent_at | Cierre a ciegas: el servidor calcula `expected_cash` después de recibir lo contado |
| `CashMovement` | shift_id, amount, reason, created_by | Salidas de efectivo |
| `PrintJob` | kind (`cocina`\|`barra`\|`cambio`\|`ticket`\|`corte`), lines[], source_id, **dedupe_key**, status (`pendiente`\|`reclamado`\|`impreso`\|`fallido`), claimed_by, claimed_at, printed_at, attempts, reprint_of | Ver §4 |
| `PermissionProfile` | role, overrides{} | Módulo 3 |
| `AppSession` | user_id, device_id, status, last_seen | Módulo 20 |
| `SupportTicket` | kind, subject, body, status | Módulo 8 (`ticket-pull`) |
| `Attendance` | *solo si Alby confirma que "checar hora de ingresos" es su personal* | No se construye hasta la respuesta |

## 3. Funciones (presupuesto: `maxFunctions: 40`)

| Endpoint | Acciones | Módulo |
|---|---|---|
| `createWineBar` | (existente) | onboarding, módulo 24 |
| `manageStaff` | list, invite, setRole, remove | 2, 7 |
| `catalog` | upsertCategory, upsertProduct, toggleProduct, listProducts (costo redactado) | Menú |
| `orders` | open, addItem, updateItem, cancelItem, send, moveTable, mergeTables, cancelOrder | Comandas |
| `stations` | markReady, markDelivered | Cocina y barra |
| `payments` | applyDiscount, setTip, addPayment, voidPayment, closeOrder, splitPreview | Cobro |
| `shifts` | open, addCashOut, close (envía correo), resendEmail | Turno y corte |
| `inventory` | addEntry, addWaste, count | Inventario |
| `printing` | claimNext, markPrinted, markFailed, reprint | Impresión |
| `reports` | day, week, range (con comparativo) | Reportes |
| `account` | exportData, deleteMyAccount, deleteBar | 7 |
| `permissions` | getProfile, upsertProfile | 3 |
| `acaciaControl` | ping (salud, módulo 5), license, tickets, usage | 5, 15 |
| `purgeStaleSessions` | cron 48 h | 20 |

≈ 14 endpoints. `processSale` se retira cuando `orders` + `payments` lo cubran
(antes de retirarla: `npm run functions:audit`).

Orden de validación en **cada** acción de escritura (el mismo de StockFlow):
auth → releer el `User` con `asServiceRole` (módulo 22) → registro cargado
del servidor y su `tenant_id` contra el del usuario → `hasPermission()` →
`billing_status` (`view_only`/`suspended` rechazan) → validación de campos →
escritura como service role.

## 4. Impresión sin repetir (D9)

1. Enviar a cocina/barra, pedir la cuenta, cerrar turno o reimprimir crean un
   `PrintJob` con `dedupe_key` determinista (p. ej. `send:<order>:<lote>`).
   Antes de crear, el servidor busca esa llave; si existe, no crea otra.
2. La laptop abre Sommel en modo estación (`/estacion/impresion`), se
   suscribe a `PrintJob` y llama `printing.claimNext`. El servidor marca el
   trabajo `reclamado` por ese dispositivo y **relee**: si otro dispositivo lo
   reclamó primero (escrituras cruzadas), el perdedor lo suelta. Mismo patrón
   de sobreviviente determinista que `reconcileDuplicates` de StockFlow.
3. La laptop imprime con `window.print()` (Chrome con `--kiosk-printing` y el
   driver de la Xprinter) sobre una plantilla de 58 mm, y confirma con
   `markPrinted`. Un trabajo `reclamado` más de 2 minutos sin confirmar vuelve
   a `pendiente` para que no se pierda si la laptop se cayó a la mitad.
4. **Reimprimir** siempre es explícito y crea un trabajo nuevo con
   `reprint_of`. Nada se reimprime solo al reconectar: al volver, la laptop
   muestra lo pendiente y la persona decide.

Riesgo abierto: que el driver de la Xprinter imprima sin diálogo en modo
kiosco. **Es lo primero que se prueba en la semana 0**, antes de construir
§4.3. Si falla, la alternativa (a decidir con José, sin costo asumido) es
WebUSB directo en Chrome.

## 5. Dinero: reglas que el servidor impone

- Precio, costo, subtotal, descuento, propina, total, cambio y diferencia de
  caja **solo los calcula el servidor**. El cliente manda cantidades y
  elecciones, nunca importes (excepto lo recibido en efectivo y el monto de
  cada pago parcial).
- Un pago que excede lo que falta se rechaza, salvo efectivo, donde el
  excedente es cambio.
- La orden se cierra sola cuando lo pagado = total (promesa de pantalla 2).
- Una cortesía es un descuento del 100% con motivo, y sale aparte en reportes.
- Cancelar un platillo ya preparado genera merma con su costo; cancelar una
  orden pagada exige registrar la devolución (efectivo sale de caja).
- Montos en centavos enteros en el servidor para no arrastrar errores de
  punto flotante.

## 6. Orden de construcción (sigue las entregas de la propuesta)

| Fase | Contenido | Cierra cuando |
|---|---|---|
| **0 · Base** (ahora) | Este plan; `base44.app.json`; scripts de deploy y `validate:rls` / `validate:functions` / `validate:tenant-roles` en CI; entidades nuevas en el repo (sin desplegar); quitar Stripe | Checks en verde en CI |
| **0b · Semana 0** | Prueba de impresión en la laptop de Alby; prueba de correo Base44; cargar el menú del Excel | Imprime y llega el correo |
| **1 · Entrega 1** (sem. 1-3) | Menú, mesas, comandas, cambios, envío a cocina/barra con tiempos | Alby toma órdenes de prueba y cocina las recibe |
| **2 · Entrega 2** (sem. 4-5) | Cobro, turno y corte al correo, reportes, inventario, ticket impreso | Turno de prueba comparado con Loyverse |
| **3 · Paralelo** (sem. 6) | Ajustes con datos reales | Los cortes de los dos coinciden |
| **4 · Arranque** (sem. 7) | Capacitación, módulos 9/13/17 cerrados, auditoría del módulo 14 | Deja Loyverse |

Estándar a cerrar antes del arranque en piso: 1, 2, 3, 4, 5, 6, 7, 8, 10,
11, 12, 13, 14, 15, 16, 17, 20, 21, 22, 23, 24. El 9 (página en
acaciaco-site) y el 17 (Mission Control) se hacen en la fase 4.

## 7. Pendiente de Alby que cambia el diseño

- "Checar hora de ingresos": si es asistencia del personal, se agrega
  `Attendance` + PIN; si es hora de entrada/salida de la orden, ya lo cubre
  `OrderItem.sent_at`/`ready_at`.
- IVA incluido o no en sus precios (cambia el ticket y los reportes).
- Propina y descuentos que usa; si acepta vales.
- Anticipos de arcones: queda para después salvo que ella lo pida.
- Tisanas a granel por peso y Frutos del Bosque por taza (cambia `variants`).
- Correo(s) del corte y horario de servicio (ventana sin deploys).

## 8. Reglas internas de operación

- **No se despliega nada en su horario de servicio.**
- Deploy por los scripts del repo (`npm run deploy`, `deploy:site`,
  `deploy:entities`), que leen el `appId` de `base44.app.json`. Mergear no
  despliega. Se verifica por contenido, no por hash.
- Formato en papel de respaldo (PDF) entregado antes de la Entrega 2.
- Cada cambio de entidad o función repite la auditoría del módulo 14 y se
  anota en `CLAUDE.md`.
