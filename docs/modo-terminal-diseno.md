# Modo terminal: entrar con PIN en los equipos del bar

Estado: **diseño para aprobar** (2026-10-06). Nada de esto está construido.

## Decisiones de José (2026-10-06)

- **Modo terminal**: el PIN solo sirve en equipos que el admin autorizó. No hay
  URL abierto por bar con PIN, porque un PIN de 4 dígitos (10,000 combinaciones)
  expuesto a internet se puede adivinar.
- **Todas las personas se identifican** con su nombre y su PIN. No todas tienen
  correo; con PIN basta para trabajar en la terminal.
- **Acceso remoto (correo)** solo para quien el admin autorice, por ejemplo el
  admin y el encargado. Con correo se entra desde cualquier equipo, como hoy.
- **Bloqueo a los 2 minutos** sin uso en la terminal.
- **El admin decide quién puede hacer acciones elevadas** (descuentos,
  cortesías, cancelaciones y lo demás que hoy es permiso): por persona, no solo
  por rol.

## Cómo se ve

1. El admin entra con su correo en la laptop de caja o la tablet y pulsa
   **"Usar este equipo como terminal de <bar>"**. Le pone nombre ("Caja",
   "Barra"). Desde Ajustes ve sus terminales y puede **revocar** cualquiera.
2. La terminal muestra **"¿Quién eres?"**: botones con los nombres de quien
   puede entrar **en ese momento y en esa terminal** (ver "Quién aparece"), y
   el teclado de PIN (el mismo del checador).
3. Con el PIN correcto, Sommel trabaja **como esa persona**: sus permisos, y todo
   lo que hace queda a su nombre (comanda, cobro, cancelación, cortesía, corte).
4. A los 2 minutos sin tocar la pantalla, o con **"Cambiar usuario"**, vuelve a
   "¿Quién eres?". El trabajo abierto (una comanda a medias) no se pierde: es del
   servidor, no de la sesión.
5. El checador vive en la misma pantalla: "Checar entrada/salida" con el PIN,
   sin entrar a la app.

## Quién aparece en "¿Quién eres?" (José, 2026-10-06)

Botones dinámicos, para elegir rápido:

1. **A esa hora**: quien checó entrada y no ha checado salida. Sommel no tiene
   horarios; el checador es lo que dice quién está trabajando ahora.
2. **En esa terminal**: la lista de la terminal (todos, ciertos roles o ciertas
   personas), que el admin elige al activarla. Ej.: "Barra" solo bartenders.
3. **Admin y encargado siempre aparecen**, hayan checado o no, para autorizar o
   corregir.
4. **En vivo**: checar entrada en otra tablet hace aparecer el botón sin
   recargar.
5. **"Checar entrada"** siempre a la vista, con PIN, para quien todavía no
   aparece.

Opcional, no pedido todavía: **horarios por persona** como tercera condición.

## Piezas

### 1. Personas del bar: `StaffMember` (entidad nueva)

Hoy cada persona es un `User` de Base44, y Base44 exige correo. La persona del
bar pasa a ser su propia entidad:

| campo | para qué |
|---|---|
| `tenant_id` | su bar |
| `name` | lo que se ve en "¿Quién eres?" y en reportes |
| `role` | `staff` o `bar_admin` |
| `permission_overrides` | lo que el admin le da o le quita a **esta** persona |
| `user_id` | solo si tiene acceso remoto (cuenta con correo) |
| `active` / `archived_at` | baja sin borrar historia |

El PIN (`StaffPin`) pasa de `user_id` a `staff_member_id`, con el mismo hash y
bloqueo por intentos que ya existe. Migración: un `StaffMember` por cada `User`
actual del bar, con su PIN.

### 2. Terminal: `TerminalDevice` (entidad nueva)

`tenant_id`, `name`, `activated_by`, `token_hash`, `last_seen_at`,
`revoked_at`, y `allowed` (todos, roles o personas que pueden usarla). Al activar, el servidor genera un secreto que el equipo guarda
(solo el hash queda en la base). Revocar corta el equipo en la siguiente
llamada.

### 3. El pase de la persona

Al poner el PIN en una terminal válida, el servidor devuelve un **pase firmado**
(HMAC con un secreto del servidor): bar, persona, terminal, vence en 15 min y se
renueva mientras haya actividad. Cada llamada de la terminal manda pase y token
de terminal; `requireContext` los verifica y arma el `ctx` con **la persona del
pase**: su rol, sus permisos y su nombre para firmar lo que haga. Sin pase
válido, en una terminal solo responden "¿quién eres?", desbloquear y checar.

El bloqueo de 2 minutos es del navegador (borra el pase). El vencimiento corto
del pase es la red de seguridad del servidor si alguien se salta el navegador.

### 4. Permisos por persona

Precedencia: plataforma o `bar_admin` → todo; si no, override **de la persona**;
si no, el perfil del rol (`PermissionProfile`, el de hoy); si no, el default del
registro. En Staff, cada persona tiene su ficha con los permisos elevados como
interruptores (descuentos, cortesías, cancelar renglones, anular pagos, corte).

### 5. Quién hizo qué

Cada escritura guarda la persona del `ctx` (id y nombre congelado): orden
abierta por, renglón cancelado por, descuento o cortesía por, pago cobrado por,
turno abierto o cerrado por. Hoy se guarda el `User` de la sesión; hay que
recorrer los handlers de `orders`, `payments`, `shifts`, `inventory` y
`attendance`.

## El punto técnico a resolver primero

La terminal necesita una sesión de Base44 para llamar funciones y leer en vivo.
Dos caminos:

- **A. Cuenta propia por terminal** (preferida): un usuario de Base44 de la
  terminal, con el bar y un rol `terminal` sin permisos propios. Si alguien abre
  las herramientas del navegador, no consigue más que lo que su pase le da.
  **Riesgo:** `auth.register` e `inviteUser` piden un correo real que se verifica
  con código; no está probado que Sommel pueda crear esa cuenta sin un buzón.
- **B. La sesión del admin que activó el equipo**: funciona hoy sin nada nuevo,
  pero alguien con el equipo en la mano y las herramientas del navegador podría
  hacer llamadas como el admin sin pase. Se mitiga, no se cierra.

**Primer paso:** una prueba corta para ver si A es posible. Si no lo es, se
decide entre B con mitigaciones o pedir un correo por terminal (por ejemplo
`caja@vindima...`) que el admin verifica una vez.

## Fases

1. Prueba del punto técnico (A o B).
2. `StaffMember` + migración + PIN por persona + terminal + pase + "¿Quién
   eres?" + bloqueo a 2 minutos + firma de quién hizo qué.
3. Permisos por persona en Staff.
4. (Opcional) **Autorización en el momento**: si un mesero sin permiso intenta
   una cortesía, que el encargado ponga su PIN ahí mismo y quede registrado
   quién autorizó.

5. (Opcional) **Huella digital** con WebAuthn (passkeys): la persona registra
   su huella en esa terminal; Sommel guarda solo una llave pública por persona y
   terminal, nunca la huella. Usos: el admin puede exigir **huella además del
   PIN** para cuentas con poder (admin, encargado), y la huella del encargado
   sirve como autorización en el momento (fase 4). Funciona con Touch ID (Mac) y
   Windows Hello (incluye lectores USB que Windows reconozca como Hello). **No**
   funciona con un lector USB en Mac ni con lectores de checador con programa
   propio (tipo ZKTeco): el navegador no los ve. Pendiente: modelo del lector de
   José y en qué equipo va.

## Lo que no cambia

- El admin y quien tenga acceso remoto siguen entrando con correo, en cualquier
  equipo.
- Las reglas de aislamiento entre bares: el bar siempre sale del servidor, nunca
  del navegador.
