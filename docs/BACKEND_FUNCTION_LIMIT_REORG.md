# Presupuesto de funciones y mapa de routers

Base44 corta en **50** funciones; este repo se fija en `maxFunctions: 40`
(`base44.app.json`). Por encima del tope, el deploy falla a media aplicación y
la CLI no llega a su fase de poda, así que las funciones viejas siguen ocupando
los slots que harían falta para arreglarlo. `npm run validate:functions` (dentro
de `npm run lint`) cuenta un endpoint por cada `entry.ts`.

Última cuenta: **2026-09-29, 15 de 40** (margen 25).

## Patrón

El repo se construyó "router primero": un endpoint por área, con un
`handle(req, { accion: handler })` que viene del `_guard.ts` canónico. Los
handlers viven en `handlers/` y los ayudantes llevan prefijo `_` (no cuentan).
Consolidar no fue necesario, así que no hay historia de fusiones; este archivo
solo documenta a qué handler va cada acción.

Reglas:
- Una acción nueva es un archivo en `handlers/` y una línea en el router. **No
  suma** al conteo.
- Un directorio con solo `_guard*.ts` (hoy `account` y `session`) **no cuenta**:
  no tiene `entry.ts`. Un `entry.ts` nuevo sí.
- `_guard.ts` y `_guard_logic.ts` de cada función son copias generadas de
  `scripts/templates/`; no se editan a mano (`npm run check:guards` falla si
  derivan; regenerar con `npm run generate:guards`).
- Antes de retirar o fusionar una función: `npm run functions:audit`. Una función
  sin llamadores en el repo casi nunca está muerta (puede llamarla un cron, un
  hook o Mission Control).

## Mapa de routers (acción a handler)

Todos los handlers están en `base44/functions/<router>/handlers/<accion>.ts`
salvo donde se indica.

| Endpoint | Acciones |
|---|---|
| `orders` | open, addItems, updateItem, removeItem, send, cancelItem, moveTable, mergeOrders, cancelOrder, upsertTable, deleteTable |
| `payments` | summary, applyDiscount, setTip, splitPreview, addPayment, voidPayment, requestTicket |
| `stations` | markReady, markDelivered, undoReady, getConfig |
| `shifts` | current, open, addCashOut, close, list, resendEmail, printCorte |
| `catalog` | listProducts, upsertCategory, deleteCategory, upsertProduct, toggleProduct, importMenu (única ruta `allowNoTenant`, solo plataforma) |
| `inventory` | list, movements, upsertItem, addEntry, addWaste, count, linkProduct |
| `printing` | queue, claimNext, markPrinted, markFailed, retry, reprint |
| `reports` | summary |
| `settings` | get, update |
| `attendance` | roster, punch, setMyPin, resetPin, records, correct |
| `permissions` | getProfile, upsertProfile (solo rol `staff`; `bar_admin` o plataforma) |
| `manageStaff` | list, invite, setRole, removeMember, revokeInvite, claimInvite (router en `entry.ts`, sin `handlers/`) |
| `createWineBar` | endpoint único (alta de bar, 409 `already_in_a_bar`) |
| `acaciaControl` | `switch` en `entry.ts`: ping, licenses.list, license.get, license.set, tenants, tickets.list, usage, usage.summary, usage.byTenant, sessions.list, sessions.revoke. Falla cerrado (503) sin secretos |
| `processSale` | RETIRADA (410). Sigue contando como endpoint hasta borrarla; antes: `npm run functions:audit` |

## Reservado para la ola 2 (presupuesto)

| Endpoint | Para | Cuenta |
|---|---|---|
| `account` | exportData, deleteMyAccount, delegateBar | +1 (ya tiene guardia) |
| `session` | manageSession, sessionHeartbeat, revokeSession | +1 (ya tiene guardia) |
| `purgeStaleSessions` | cron, falla cerrado sin `CRON_SECRET` | +1 |

Con eso: 18 de 40. Retirar `processSale` (tras el audit) deja 17.
