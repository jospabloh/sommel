# Migración de Sommel a Supabase + Vercel (diseño, 2026-10-14)

Estado: **aprobado por José el 2026-10-14; en construcción.** Proyecto de Supabase: `sommel`, ref `gyzmfplevicqwbynznei`, región `us-east-2`, plan gratuito.
Este documento es también el primer caso del módulo 31 del estándar
(`acacia-app-standard`, "Capacidad y plataforma de backend"): lo que aprendamos
aquí se vuelve el método para el resto del portafolio.

## 1. Por qué migrar (medido, no supuesto)

Mediciones del 2026-10-14 contra producción, en el bar de prueba "Bar Onboarding
QA", con dos cuentas de prueba (`+sommelnew`, `+sommelload`), a una hora sin uso:

| Prueba | Resultado |
|---|---|
| Un usuario, lecturas directas desde el navegador, a 8/s, 4/s y 1.5/s | Corte a las **~70 lecturas** en las tres velocidades: unas 70 por minuto **por usuario** |
| Dos usuarios a la vez, lecturas directas, 4/s cada uno | **70 cada uno**, al mismo segundo que uno solo: el límite es **por persona** |
| Un usuario, funciones que leen datos (`stations.getConfig`), 8/s | ~200 llamadas correctas y luego 429 |
| Dos usuarios a la vez, la misma función, 6/s cada uno | **100 cada uno, 200 en total**: el mismo total que uno solo, así que es **compartido por toda la app** |
| Funciones que no tocan datos (acción inexistente, 400), 8/s durante 60 s | 478 de 478, **cero 429** |

**Conclusión.** Base44 limita las **operaciones de entidad**, no las llamadas.
Su documentación dice "los límites son por persona", y es cierto para lo que hace
el navegador. Pero todo lo que una función hace con `asServiceRole` sale de **una
sola cuenta de servicio para toda la app**, y esa cubeta es de unas **400
operaciones por minuto** para todos los bares juntos. Sommel hace por seguridad
todas sus escrituras y casi todas sus lecturas con esa cuenta (el navegador no
toca dinero ni inventario). Así que cada bar nuevo resta de la misma bolsa.

Estimado de capacidad en Base44, con el código ya optimizado (#82):
- Un cobro cuesta ~24 operaciones; una cuenta completa (abrir, agregar, enviar,
  cobrar, ticket, imprimir) unas 60.
- Un bar ocupado en hora pico hace unas 40 cuentas por hora: ~40 operaciones por
  minuto.
- **Unos 10 bares en hora pico llenan la cubeta.** Mover lecturas a la cubeta de
  cada usuario subiría eso a unos 20 o 30. 100 bares no caben en ningún caso.

Lo que dice internet (2026-10-14): Base44 no publica el número. Terceros con
interés comercial reportan "150 operaciones por minuto, igual en todos los planes
por debajo de Enterprise", y citan al equipo de Base44: "para apps con mucho
backend, nuestros límites pueden ser una pared". Enterprise tendría límites
mayores, con precio a cotizar. El soporte de Base44 no se considera una vía
(decisión de José).

## 2. Por qué Supabase

| | Base44 | Supabase (Pro) |
|---|---|---|
| Límite de operaciones de base de datos | ~400/min para toda la app (medido) | No hay cuota por operación; el techo es el tamaño de la máquina de Postgres |
| Transacciones | No existen: hay que releer después de escribir para ganar carreras | Postgres real: transacciones, índices únicos, `FOR UPDATE` |
| Tiempo real | Cada evento de cualquier bar llega a todos los clientes y se filtra en el navegador | Filtrado por bar en el servidor; Pro: 500 conexiones simultáneas y 500 mensajes/s (10,000 y 2,500 sin tope de gasto) |
| Funciones | Deno, tope de 50 | Deno (Edge Functions), 2 millones de invocaciones al mes incluidas, 2 s de CPU por petición |
| Ya lo usa el portafolio | — | Mission Control |

Fuentes: documentación de Supabase (Realtime Limits, Edge Functions limits, Billing).

Las funciones de Sommel ya son Deno, así que la mayor parte del backend se
**porta**, no se reescribe.

## 3. Arquitectura destino

```
Navegador (Vite/React, Vercel)
  ├─ supabase-js: Auth, lecturas directas con RLS, Realtime por bar
  └─ POST /functions/v1/<router>  {action, ...}   (mismo contrato que hoy)
Supabase
  ├─ Postgres: tablas por entidad, RLS por tenant_id, funciones SQL transaccionales
  ├─ Auth: correo + contraseña con código, Google, reset; SMTP propio (Resend)
  ├─ Edge Functions (Deno): los 21 routers de hoy, portados
  ├─ Realtime: Postgres Changes filtrado por tenant_id
  └─ pg_cron: purga de sesiones (antes purgeStaleSessions + GitHub Actions)
Mission Control → POST firmado a acaciaControl (Edge Function), mismo HMAC
Impresoras Star → cloudprnt (Edge Function); Vercel reescribe la URL vieja
```

### 3.1 Datos
- Una tabla por entidad de hoy, mismos nombres de campo, `snake_case` (ya lo son).
  `id uuid` por omisión; `created_date` y `updated_date` como columnas para que
  el código que ordena por `-created_date` no cambie.
- **Toda tabla con inquilino lleva `tenant_id uuid not null references wine_bar`**
  e índice `(tenant_id, …)` para cada consulta caliente.
- **Lo que el estándar hoy resuelve releyendo, Postgres lo resuelve con
  restricciones**: índice único `(tenant_id, idempotency_key)` en `payment`,
  `inventory_movement` y `cash_movement`; único `(tenant_id, dedupe_key)` en
  `print_job`. Con eso desaparecen `reconcilePayments`, la relectura de
  duplicados y el "neutralizar en vez de borrar". Reclamar un trabajo de
  impresión pasa a ser un `UPDATE … WHERE status='pendiente' RETURNING`, atómico.
- **Los campos de costo se separan en su propia tabla** (`order_item_cost`,
  `product_cost`, etc.), legible solo por el servidor. Una política RLS es por
  fila, no por columna, y el tiempo real manda la fila completa: tener el costo
  en otra tabla es la única forma en que nunca viaja al navegador del staff.
- Los candados de campo de hoy (`rls.write:false` en `User.tenant_id`,
  `WineBar.billing_status`, etc.) pasan a ser: el navegador **no escribe ninguna
  tabla** (sin políticas de insert/update/delete para `authenticated`), igual que
  hoy, salvo `support_ticket.insert` del propio bar.
- `User` se parte en `auth.users` (de Supabase) y `profile` (nuestra:
  `tenant_id`, `app_role`, `display_name`, `photo_check`,
  `permission_overrides`), escrita solo por el servidor.

### 3.2 Aislamiento (módulos 4, 14, 24)
- RLS activo en **todas** las tablas. Lectura con inquilino:
  `tenant_id = (select tenant_id from profile where user_id = auth.uid())`,
  envuelta en una función `security definer` con `search_path` fijo (el mismo
  patrón que `current_member_role()` de Mission Control), para que Postgres la
  evalúe una vez por consulta y no por fila.
- Las escrituras las hacen las Edge Functions con la llave de servicio, después
  del mismo guard de hoy (permiso, facturación, aprobación). El guard **no
  cambia de reglas**, cambia de transporte.
- Pruebas de aislamiento en SQL, en CI: un usuario de un bar intenta leer y
  escribir filas del otro, tabla por tabla, y debe recibir cero filas o error.
  Sustituyen a `validate:rls` y `validate:locks`, que solo entendían Base44.

### 3.3 Backend
- **Capa de compatibilidad**: un objeto `entities` con la misma forma que hoy
  (`filter(query, sort, limit, skip)`, `get`, `create`, `update`, `delete`) que
  traduce a supabase-js, incluidos `$in`, `$gte`, `$lt` y el orden
  `'-created_date'`. Con eso los 21 routers se portan casi sin tocar sus
  handlers, y cada cambio de lógica queda fuera de la migración.
- Después, ya en Supabase y con pruebas, las rutas calientes (cobrar, enviar,
  descontar inventario, reclamar impresión) se pasan a **funciones SQL en una
  sola transacción**. Es el paso que de verdad cambia la escala: un cobro deja
  de ser 24 viajes y pasa a ser uno.
- `processSale` (retirada) no se porta.
- Correo: `Core.SendEmail` → Resend, con remitente de `acaciaco.com.mx`.
- Cron: `purgeStaleSessions` → `pg_cron` dentro de Postgres.

### 3.4 Autenticación
- Supabase Auth: correo + contraseña con código de 6 dígitos (el paso de
  verificación de hoy se queda), Google, recuperar contraseña.
- **SMTP propio con Resend desde el primer día**: el SMTP de Supabase es solo
  para pruebas y manda muy pocos correos por hora.
- Terminales y personas sin correo (hoy usan la API beta de Base44 que ya nos
  rompió una vez, `/embed-tokens` → `/embed-url`): se crean con
  `auth.admin.createUser` (correo sintético, contraseña aleatoria guardada solo
  en el servidor) y el servidor inicia la sesión por ellos. Es API estable de
  Supabase, no beta.

### 3.5 Lo que se queda igual
Toda la lógica pura (`_*_logic.ts`, `src/lib/*`) y sus 600+ pruebas; WebUSB,
ESC/POS y la herramienta de Windows; el contrato de cada acción con el cliente;
el puente con Mission Control (mismo HMAC por app); el dominio
`sommel.acaciaco.com.mx` (las llaves de acceso del celular están atadas a él).

## 4. Fases

| Fase | Qué | Cómo se verifica |
|---|---|---|
| 0 | Infra: proyecto `sommel` en la organización actual (gratis), proyecto en Vercel, Resend, respaldo diario con `pg_dump` | El proyecto responde; el primer respaldo existe fuera de Supabase |
| 1 | Esquema, RLS, índices únicos, `profile`, pruebas de aislamiento en SQL | Pruebas de aislamiento en CI, verdes. **Hecha el 2026-10-14:** aplicada al proyecto `sommel`, 1,670 aserciones verdes en Supabase real y en CI (Postgres 16 con stub) |
| 2 | Capa `entities` + guard portado + los 21 routers | Las 600+ pruebas de lógica, más pruebas nuevas del guard contra un Postgres real. **En construcción desde el 2026-10-16** (PRs #99 a #106): el guard no se portó a mano; las funciones se **generan** desde `base44/functions` con un módulo compatible con el SDK (`supabase/README.md`, "Fase 2"). Se prueba en memoria (barrido de las 21 y flujos de punta a punta) y contra la pila local de Supabase en CI (job `supabase-stack`), no en una rama de Supabase (el plan gratuito no tiene ramas) |
| 3 | Cliente: supabase-js, páginas de auth, `callFn`, lecturas directas, tiempo real | Recorrido completo en el navegador contra el proyecto nuevo, a 390/834/1440 |
| 4 | Terminales, personas sin correo, llaves del celular, CloudPRNT, correos | Lo mismo que se verificó en Base44, otra vez |
| 5 | Mission Control: `bridge_url` en `apps.config`; `callBridge` hace POST firmado; los crons aceptan `backend='supabase'` | Sync y `license.set` contra Sommel en Supabase |
| 6 | **Prueba de carga: 100 bares simulados en hora pico** | Sin 429 y p95 bajo 1 s. Es el criterio de aceptación de toda la migración |
| 7 | Rutas calientes a funciones SQL transaccionales | La misma prueba de carga, con más margen |
| 8 | Corte: DNS de `sommel.acaciaco.com.mx` a Vercel, menú reimportado, Base44 en solo lectura y luego retirado | Smoke contra producción; verificación por contenido |

Datos: hoy solo hay datos de prueba, así que **no se migran filas**. El menú de
Vindima se vuelve a importar desde `base44/seed/vindima-menu.json`.

## 5. Costos: empezar en $0 (decisión de José, 2026-10-14)

Con un solo cliente no se paga todavía. El plan gratuito permite 2 proyectos
activos por persona (los pausados no cuentan). Con `plink-fx` pausado
(2026-10-14, acaciaco-site#263 lo dejó sin Supabase) quedan: Mission Control y
**Sommel, gratis**.

Qué da el plan gratuito y qué tan lejos alcanza para Sommel:

| | Gratis | Alcanza para |
|---|---|---|
| Base de datos | 500 MB | Años con unos pocos bares |
| Edge Functions | 500,000 invocaciones al mes | Unos 2 o 3 bares activos sin sondeos (el tiempo real sustituye al sondeo de 45 s de hoy) |
| Tiempo real | 200 conexiones, 100 mensajes/s | Decenas de bares |
| Usuarios activos | 50,000 al mes | De sobra |
| Respaldos | **Ninguno automático** | Hay que hacerlos nosotros |
| Pausa | Se pausa tras 7 días sin actividad | Un bar que abre a diario no se pausa |

Lo que hay que poner para que gratis sea seguro:
- **Respaldo diario propio**: `pg_dump` cada noche desde GitHub Actions, guardado
  fuera de Supabase. Es lo que la propia documentación de Supabase pide para el
  plan gratuito.
- **Alarma de consumo**: un aviso cuando las invocaciones del mes pasen de 60 %.

**Cuándo pagar** (Pro, $25 USD al mes, con $10 de crédito que cubre la máquina
de Sommel; Mission Control se puede quedar en la organización gratuita):
- cuando se acerque el tope de invocaciones o el tercer bar pagando, lo que pase
  primero; o
- si José decide que los respaldos diarios automáticos y sin pausa valen ya.

Pasar a Pro no migra nada: el proyecto se transfiere (con sus datos) a una
organización "ACACIA" y esa organización se pasa a Pro, así se paga solo por lo
que es SaaS. Mientras tanto el proyecto vive en la organización actual, gratis.

Proyectos pausados de la organización personal (`liuma-dev`, `fidelity-mvp`,
`plink-fx`): José pidió borrarlos. La herramienta de Supabase de esta sesión
puede pausar pero no borrar; se borran desde el panel (Project Settings →
General → Delete project). Borrar es irreversible y se lleva sus respaldos.

## 6. Decisiones

Tomadas por José: migrar ahora con datos de prueba; empezar sin pagar.
Por omisión, salvo que diga otra cosa: frontend en Vercel; remitente
`sommel@acaciaco.com.mx` por Resend; datos limpios (el menú se reimporta).
Nada requiere a José para arrancar: el proyecto se crea en la organización
actual, gratis.

## 7. Riesgos conocidos

- **Llaves de acceso del celular**: están atadas al dominio. Mientras se prueba
  en un dominio de vista previa, aprobar con el celular no funcionará; con el
  dominio definitivo sí.
- **Impresoras CloudPRNT ya configuradas** usan la URL de Base44; Vercel debe
  reescribir esa ruta a la Edge Function nueva (hoy no hay impresoras Star
  reales, así que el riesgo es bajo).
- **Postgres Changes** escala peor que Broadcast con muchos clientes. Para 100
  bares alcanza; si se queda corto, se pasa a Broadcast desde la base de datos
  sin cambiar el modelo de datos.
- El guard y los `entry.ts` nunca tuvieron pruebas de integración en Base44; en
  Supabase sí se pueden escribir, y son parte de la fase 2.
