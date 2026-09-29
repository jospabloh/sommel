# Inventario de bloqueos (módulo 19)

Fecha: **2026-09-29**. Fuente de verdad ejecutable:
`scripts/lib/locks-rules.mjs` (manifiesto, 23 entradas), comprobado por
`scripts/validate-locks.mjs` y `base44/tests/locks_test.ts`.

Principio: un bloqueo de seguridad se documenta en una **descripción de esquema
que se despliega** (los comentarios `//` de los `.jsonc` no llegan al backend).
Cada descripción dice la operación que gobierna, quién la usa de verdad y qué se
abre si se quita. **Un síntoma no se arregla aflojando un bloqueo.**

## Bloqueos de campo

| Entidad.campo | Operación | Regla | Quién lo usa legítimamente |
|---|---|---|---|
| `User.tenant_id` | escritura | `false` | `createWineBar`, `manageStaff` (servicio) |
| `User.app_role` | escritura | `false` | `createWineBar`, `manageStaff` (servicio) |
| `WineBar.billing_status` | escritura | `role:admin` (plataforma) | Mission Control vía `acaciaControl` |
| `WineBar.trial_end_at` | escritura | `role:admin` | `createWineBar`, Mission Control |
| `WineBar.current_period_end` | escritura | `role:admin` | Mission Control |
| `WineBar.plan` | escritura | `role:admin` | Mission Control |
| `WineBar.owner_id` | escritura | `role:admin` | `createWineBar`; `manageStaff` lo lee para `owner_locked` |
| `OrderItem.unit_cost` | lectura | `role:admin` | servidor (reportes con `Menú:ver_costos`) |
| `InventoryItem.unit_cost` | lectura | `role:admin` | servidor |
| `InventoryMovement.unit_cost` | lectura | `role:admin` | servidor |

Si se quita `billing_status`/`plan`/fechas, cualquier miembro del bar podría
reactivar su propio bar suspendido. Si se quita el bloqueo de `User.tenant_id`
o `app_role`, cualquiera podría cambiarse de bar o darse `bar_admin`. Si se
quita el de `unit_cost`, el costo llegaría al navegador de quien no debe verlo.

## Bloqueos de entidad

| Entidad | Operaciones solo-admin | Dónde vive la razón |
|---|---|---|
| `Product` | read, create, update, delete | descripción de `tenant_id` |
| `Attendance` | read, create, update, delete | descripción de `tenant_id` |
| `StaffPin` | read, create, update, delete | descripción de `tenant_id` |
| `Order`, `Payment`, `Shift`, `CashMovement`, `StaffInvite`, `PermissionProfile` | create, update, delete | descripción de `tenant_id` |
| `OrderItem`, `InventoryItem`, `InventoryMovement` | create, update, delete | solo regla |
| `WineBar` | create, delete | solo regla |

`Product.read` es solo-admin porque `variants[].cost` no se puede bloquear por
campo: nadie lee `Product` directo, `catalog.listProducts` redacta el costo.
Aflojarlo para "que carguen los productos" filtraría el costo. `PermissionProfile`
es solo-admin en escritura porque quien decide qué puede hacer un `staff` no
puede ser el propio `staff`.

## Notas

- **No se sabe** si Base44 acepta una descripción a nivel de entidad; por eso la
  razón va en el campo `tenant_id`, que es estable. Tampoco se probó en vivo que
  Base44 acepte descripciones largas y las conserve al sincronizar.
- `User.role` lleva una nota de Módulo 19 (es el rol de la plataforma, distinto
  de `app_role`), pero **no** tiene bloqueo propio.
- `super_admin` sigue en el enum de `User.app_role` (no se pudo confirmar que
  ningún usuario vivo lo tenga).
- Repo y esquema desplegado coincidían en todos los bloqueos el 2026-09-29
  (lectura a mano con `list_entity_schemas`, no byte a byte en descripciones).
  Las descripciones nuevas de esta pasada **aún no están desplegadas**: llegan
  con el sync de `main`; hay que releer el esquema tras el merge.
- No existe un script que compare repo contra desplegado. Está pendiente.
