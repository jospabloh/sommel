# Checador, gestión del equipo y avisos de correo en inglés: contratos

Alcance (confirmado con José el 2026-09-29, a partir de las respuestas de
Alby del 2026-09-28):

1. **Checador de entrada y salida con PIN.** Es la pantalla 17 de la propuesta
   ("cada quien registra su entrada y salida con su PIN; tú ves las horas y
   corriges una salida olvidada con una nota"). Alby confirmó que "checar
   hora de ingresos" = entrada y salida del equipo.
2. **Quitar a alguien del equipo y cambiarle el rol.** Estaba en el plan
   (`manageStaff`: setRole, remove) y no se construyó.
3. **Avisos de que el correo del código llega en inglés.** Base44 no permite
   traducir sus correos de verificación y de cambio de contraseña
   (confirmado en su API y en su foro de sugerencias, 2026-09-28).

Todo lo de `docs/entrega-1-contratos.md` §1-§2 y `docs/entrega-2-contratos.md`
§1 sigue vigente: registros planos, 401, guard order, centavos, hora local
UTC-6, textos en español sin em dashes, tema claro y oscuro con tokens, 390 px.

Fuera de alcance: nómina, cálculo de pago por horas, geolocalización, fotos,
horarios asignados, retardos. Solo entrada, salida, horas y corrección.

## 1. Entidades nuevas (el orquestador las crea en vivo con `create_entity_schema`)

### `Attendance`
| Campo | Tipo | Notas |
|---|---|---|
| tenant_id | string | requerido |
| user_id | string | requerido; a quién pertenece la marca |
| user_name | string | nombre congelado para listar sin leer `User` |
| clock_in | string date-time | requerido, lo escribe el servidor |
| clock_out | string date-time \| null | null = sigue dentro |
| edited_by | string | correo de quien corrigió |
| edit_note | string | motivo de la corrección, obligatorio al corregir |
| edited_at | string date-time | |
| original_clock_in / original_clock_out | string date-time \| null | lo que había antes de la primera corrección (auditoría) |

RLS: **las cuatro operaciones solo plataforma** `{"user_condition":{"role":"admin"}}`.
Toda lectura pasa por `attendance.records` / `roster` (service role); un `read`
del inquilino dejaría a cualquier staff leer las marcas del equipo desde el cliente.

### `StaffPin`
| Campo | Tipo | Notas |
|---|---|---|
| tenant_id | string | requerido |
| user_id | string | requerido; uno por usuario |
| pin_hash | string | PBKDF2-SHA256, 100 000 iteraciones, hex |
| salt | string | 16 bytes aleatorios, hex, por fila |
| failed_attempts | integer | consecutivos |
| locked_until | string date-time \| null | |

RLS: **las cuatro operaciones solo plataforma** `{"user_condition":{"role":"admin"}}`.
Ni el propio bar lee los hashes; solo el servidor (service role).

## 2. Permisos nuevos (`src/lib/permissionRegistry.js`)

| Clave | bar_admin | staff |
|---|---|---|
| `Asistencia:checar` | ✓ | ✓ |
| `Asistencia:ver_equipo` | ✓ | ✗ |
| `Asistencia:corregir` | ✓ | ✗ |

## 3. Endpoint nuevo `attendance` (usa `_guard.ts`, se agrega a `TARGET_DIRS`)

Lógica pura en `handlers/_logic.ts` (hash/verify con WebCrypto van en
`handlers/_pin.ts`, sin imports externos, probable con `deno test`).

| action | payload | respuesta | permiso |
|---|---|---|---|
| `roster` | `{}` | `{ people: [{ user_id, name, has_pin, inside: bool, since? }] }` todos los miembros del bar (User con ese tenant_id); nombre = `full_name` o la parte antes de @ del correo | `Asistencia:checar` |
| `punch` | `{ user_id, pin }` | `{ record, action: 'entrada'\|'salida', name }` | `Asistencia:checar` + billing gate |
| `setMyPin` | `{ pin, current_pin? }` | `{ ok }` — PIN del propio llamador (`ctx.user.id`), 4 a 6 dígitos; si ya tiene PIN exige `current_pin` correcto | `Asistencia:checar` |
| `resetPin` | `{ user_id }` | `{ ok }` — borra el PIN de un miembro del mismo bar (tendrá que crear uno nuevo) | `Asistencia:corregir` |
| `records` | `{ from, to, user_id? }` (fechas locales, máx. 62 días) | `{ records, totals: [{ user_id, name, minutes, open }] }` | staff: solo los suyos (se ignora `user_id`); `Asistencia:ver_equipo`: todos |
| `correct` | `{ record_id, clock_in?, clock_out?, note }` | `{ record }` | `Asistencia:corregir` + billing gate |

Reglas de `punch`:
- `user_id` debe ser miembro del **mismo bar** que quien llama (el bar sale de
  `ctx`, nunca del cuerpo); si no, 404 igual que si no existiera.
- Sin PIN creado → 409 `no_pin` ("Esta persona todavía no crea su PIN").
- `locked_until` en el futuro → 423 `pin_locked` con minutos restantes.
- PIN incorrecto → `failed_attempts+1`; al llegar a 5, `locked_until = ahora + 15 min`
  y reinicia el contador; responde 401 `wrong_pin` (sin decir cuántos quedan
  más allá de "PIN incorrecto"). PIN correcto → `failed_attempts = 0`.
- Hay registro abierto de esa persona (que no sea una salida olvidada, > 16 h) → lo cierra (`salida`). Un abierto olvidado se ignora: la marca abre una `entrada` nueva y el olvidado queda abierto, marcado, para que el admin lo corrija. Si no → crea uno
  (`entrada`). **Doble toque:** si la última marca de esa persona (entrada o
  salida) fue hace menos de 60 s, devuelve esa misma sin escribir.
- Después de crear una entrada, relee los registros abiertos de esa persona;
  si hay más de uno, sobrevive el más viejo (`pickSurvivor`) y los demás se
  borran (no son dinero; no hay nada que auditar de un duplicado de 1 s).
- Comparación del hash en tiempo constante.

Reglas de `correct`: `note` obligatoria; `clock_out` ≥ `clock_in`; ninguna
fecha en el futuro; la primera corrección guarda `original_*`.

"Salida olvidada": en `records` y `roster`, un registro abierto de más de 16 h
lleva `forgotten: true`.

## 4. `manageStaff` (standalone, sin `_guard.ts`)

| action | payload | respuesta | reglas |
|---|---|---|---|
| `setRole` | `{ user_id, app_role: 'staff'\|'bar_admin' }` | `{ ok }` | solo bar_admin del bar (o plataforma); el objetivo debe ser del mismo bar (404 si no); no se cambia el rol del dueño (`WineBar.owner_id`, 409 `owner_locked`); nunca deja el bar sin bar_admin (409 `last_admin`); billing gate |
| `removeMember` | `{ user_id }` | `{ ok }` | mismas reglas; no te quitas a ti mismo (409 `self_remove`); efecto: `tenant_id` y `app_role` a null, se borra su `StaffPin`, y si tiene una entrada abierta se cierra ahora con `edit_note: 'Baja del equipo'` |
| `list` | (existente) | agrega a cada persona `is_owner: bool` | |

Lógica pura (quién puede cambiar a quién) en `_invite_logic.ts` o un
`_member_logic.ts` nuevo, con pruebas.

## 5. Pantallas

- **`/checador`** (nav "Checador", `Asistencia:checar`): pensada para una
  tablet compartida. Cuadrícula de nombres del equipo con estado (dentro
  desde las 14:02 / fuera). Tocar un nombre abre un teclado numérico grande
  para el PIN; al confirmar muestra "Entrada 14:02, Karla" o "Salida 21:30,
  Karla" unos segundos y vuelve a la cuadrícula. Errores en español
  (`wrong_pin`, `pin_locked`, `no_pin`). Botón "Mi PIN" para crear o cambiar
  el propio (pide el actual si ya existe).
- **`/asistencia`** (nav "Asistencia", `Asistencia:ver_equipo`; staff ve solo
  lo suyo desde el mismo lugar): rango de fechas (hoy, semana, rango), tabla
  por persona con total de horas, lista de marcas con entrada/salida/horas,
  marca "Salida olvidada", corregir con nota (`Asistencia:corregir`),
  "Restablecer PIN" por persona.
- **`/staff`**: por persona, menú con "Hacer administrador" / "Hacer
  equipo", "Quitar del equipo" (diálogo de confirmación que dice qué pasa:
  deja de entrar al bar, su historial de ventas y horas se queda). El dueño
  se marca y no tiene esas opciones.

## 6. Avisos del correo en inglés (textos, sin cambios de lógica)

- `src/pages/Register.jsx`, paso del código: debajo de "Enviamos un código a
  …": "Te llega en inglés, de no-reply@base44-apps.com, con el asunto
  'Verify your email for Sommel'. Revisa también en spam."
- `src/pages/ForgotPassword.jsx`, al confirmar el envío: "El correo llega en
  inglés, de no-reply@base44-apps.com. Revisa también en spam." (no inventar
  el asunto: no lo conocemos).
- `base44/functions/manageStaff/_invite_email.ts`, paso 2: "Escribe el código
  de 6 números que te llega en un correo en inglés ('Verify your email for
  Sommel')". Actualizar su prueba.

## 7. Dueño de cada archivo

| Agente | Archivos |
|---|---|
| **Base** | `src/lib/permissionRegistry.js`, `scripts/generate-guards.mjs` (+`attendance`), copias de guard, `base44/entities/Attendance.jsonc`, `base44/entities/StaffPin.jsonc`, `src/App.jsx`, `src/components/Layout.jsx`, esqueletos `src/pages/Checador.jsx` y `src/pages/Asistencia.jsx`, stub `base44/functions/attendance/entry.ts` |
| **Checador** | `base44/functions/attendance/**`, `src/pages/Checador.jsx`, `src/pages/Asistencia.jsx`, `src/components/attendance/**`, `base44/tests/attendance_*_test.ts` |
| **Equipo** | `base44/functions/manageStaff/entry.ts`, `base44/functions/manageStaff/_member_logic.ts`, `src/pages/Staff.jsx`, `src/components/staff/**`, `base44/tests/staff_members_logic_test.ts` |
| **Avisos** | `src/pages/Register.jsx`, `src/pages/ForgotPassword.jsx`, `base44/functions/manageStaff/_invite_email.ts`, `base44/tests/email_templates_test.ts` |

Equipo, al quitar a alguien, escribe `Attendance` y borra `StaffPin`
directamente con `svc` (forma fija en §1), sin llamar a `attendance`.

## Desviaciones

- **Entidades `StaffPin` y `Attendance` aún no existen en el backend** (revisión
  contra `list_entity_schemas`: 17 entidades). Siguen pendientes de
  `create_entity_schema` por el orquestador con los `.jsonc` del repo (ya con
  `Attendance.read` solo plataforma). No desplegar `attendance` ni las acciones
  nuevas de `manageStaff` hasta releer ambas.
- **`Attendance.read` cambió de inquilino a solo plataforma** (contrato §1
  original). Ningún código de `src/` lee la entidad directo.
- **Bloqueo por intentos: mejor esfuerzo.** `recordPinFailure` (`_shared.ts`)
  relee la fila antes de escribir y nunca pisa un `locked_until` vigente, pero
  Base44 no tiene incremento atómico: peticiones paralelas aún pueden repartirse
  algunos intentos extra.
- **Lecturas de `Attendance` acotadas.** Por persona: últimas 50 + abiertas; roster:
  últimas 500 + abiertas; `records`: paginado de 500 con `clock_in < fin del rango`
  (y respaldo sin rango); `removeMember`: últimas 200. Una marca abierta más
  vieja que esas ventanas y sin aparecer en la consulta `clock_out: null` no se
  vería (improbable, y ya sería "salida olvidada").
- **`removeMember` falla cerrado.** Tras `tenant_id/app_role = null` relee el
  usuario; si aún tiene bar, reintenta con `''` y, si sigue, responde 500
  `remove_failed` sin tocar PIN ni asistencia. Sin verificar contra el backend
  real cuál forma (`null` o `''`) limpia el campo.
- **Crear PIN en la tableta compartida:** el enlace solo aparece si la persona
  elegida es quien tiene la sesión; si no, se indica que lo cree desde su sesión.
