# Demo de Sommel para Alby (Vindima)

Guion de 10 a 15 minutos en el bar de prueba **Sommel QA**, en producción
(`https://sommel.acaciaco.com.mx`). Vindima todavía no tiene bar: todo lo que
se ve aquí son datos de prueba. Las contraseñas las escribe José; no van en
este archivo.

## Cuentas y equipos

| Quién | Cuenta | Rol | Dónde |
|---|---|---|---|
| Gerente | Admin Prueba (`h.josepablo+sommelqa@gmail.com`) | `bar_admin` | Laptop (la "caja") |
| Mesero | Mesero Prueba (`h.josepablo+sommelstaff@gmail.com`) | `staff` | Tablet o celular |
| Barra | Barra Prueba (`h.josepablo+sommelbarra@gmail.com`) | `staff` | Segunda pestaña o pantalla |
| Terminal | "Terminal" (activa en Sommel QA) | `terminal` | El equipo donde está activada |

Mesero Prueba, Admin Prueba, Barra Prueba, Cocina Prueba y Mesero Sin Correo
tienen PIN para la terminal y el checador.

## Antes de la demo (una vez, 10 min)

1. **Comandas viejas:** el 2026-10-16 había 6 abiertas sin pagos (Mesa 1,
   Mesa 3, Mesa 5, Barra 1, Barra 2 y una sin mesa). Como Admin Prueba,
   abrir cada una y **Cancelar orden**. Así las mesas quedan libres y la
   función registra la merma del Chai que ya se había entregado.
2. **Turno:** sin turno abierto no se puede cobrar (409 `no_open_shift`).
   Como Admin Prueba, en **Turno**, **Abrir turno** con un fondo de $500.
3. **Correos del corte:** se quedan en la cuenta QA de José, a propósito,
   para no mandarle correos de prueba a Alby. Se dice en voz alta en el paso 6.
4. **Permisos ya puestos** (2026-10-16): el staff no puede cancelar productos
   enviados (`Comandas:cancelar_enviado` en No) y no aplica descuentos (así
   viene de fábrica). Es lo que pidió Alby el 2026-10-08.
5. Nadie corre pruebas automáticas contra producción durante la demo: la cuota
   de Base44 es compartida y un 429 se vería como "Hay muchas solicitudes".
6. Tema claro en la laptop; pantalla completa desde el círculo con las
   iniciales.

## Guion

### 1. Mesas (1 min) · Mesero Prueba, tablet

- **Mesas** muestra el salón, la terraza y la barra, cada mesa con su zona.
- Tocar **Mesa 2** para abrir la cuenta.

### 2. Comanda (3 min) · Mesero Prueba, tablet

- Agregar **Malbec Valle de Guadalupe, copa** x2: la misma etiqueta vende
  copa y botella con precios distintos.
- Agregar **Chai Vindima** con el extra **Leche de almendra** (+$12): así
  quedan las tisanas de Alby. El Chai está ligado a inventario (insumo
  "Chai Vindima (porción)").
- Agregar **Tabla de quesos** con **Pan extra**.
- **Enviar.** Cada renglón se va a su estación.
- Mostrar el límite que pidió Alby: el mesero **no** puede cancelar un
  producto ya enviado.

### 3. Cocina y barra (2 min) · Barra Prueba, segunda pantalla

- **Cocina y barra** muestra las dos colas juntas; el filtro Todo / Cocina /
  Barra se recuerda por equipo.
- El color de la comanda avisa si se está tardando.
- Marcar el Malbec y el Chai como **listos**. En la tablet del mesero se ve
  el cambio sin recargar.

### 4. Cobro dividido con propina (3 min) · Admin Prueba, laptop

- En la Mesa 2, **Cobrar** → dividir en **2 partes iguales**.
- Parte 1: tarjeta, propina **15 %** de su parte.
- Parte 2: efectivo, propina **10 %**. Abre el cajón si hay impresora USB.
- Decir: los vales que pasan por la terminal bancaria se cobran como
  **Tarjeta**. Si Alby quiere verlos aparte en el corte, se agrega la forma
  de pago "Vales" en Ajustes.
- Si hay impresora conectada, sale el ticket.

### 5. Descuento solo del gerente (1 min) · Mesero Prueba y Admin Prueba

- Abrir otra mesa con un producto y entrar a cobrar como mesero: no hay
  descuento.
- Como Admin Prueba sí aparece, con motivo obligatorio.

### 6. Corte (2 min) · Admin Prueba, laptop

- **Turno**: ventas por forma de pago, propinas y efectivo esperado.
- **Cerrar turno** contando el efectivo. Si queda una mesa abierta, Sommel
  no deja cerrar (`open_orders`). Es la pregunta que Alby tiene pendiente
  ("hay que pagarlas para hacer corte"), así que conviene mostrarlo y
  preguntarle ahí mismo.
- El corte se manda por correo. En su bar llegará a
  `albilda@rochavillanueva.com` y `vindima.ags@gmail.com`; en esta demo va a
  la cuenta QA.

### 7. Checador en la terminal (2 min) · Terminal

- En "¿Quién eres?", **Checar entrada o salida** con el PIN de Mesero Prueba,
  sin desbloquear la terminal.
- Entrar a la terminal con el PIN: el PIN entra al último número y el
  teclado tiembla si es incorrecto.
- Arriba a la derecha, **Checar** y **Cambiar usuario** a un toque.

### 8. Reportes (1 min) · Admin Prueba, laptop

- **Reportes** del día: ventas netas, por forma de pago, por producto y
  propinas.
- **Inventario**: el Chai bajó una porción por la venta del paso 2.
- Decir: la **utilidad** sale completa cuando estén los costos del menú, que
  Alby mandará al regresar. Mientras tanto, el menú se carga con precios.

## Qué preguntar al final

- Una fecha para la visita en Vindima: impresora en su laptop y órdenes de
  prueba. Ver la sección "Seguimiento con Alby" de `CLAUDE.md`.
- Cerrar turno con una mesa sin pagar: ¿pasa al siguiente turno o el gerente
  la cobra antes del corte?
- IVA incluido en sus precios y horario de servicio: no aparecen respondidos
  en el repo.

## No verificado

- Este guion no se ha corrido de punta a punta; las rutas y nombres salen del
  código y de los datos leídos el 2026-10-16.
- Que la terminal "Terminal" siga activada en un equipo a la mano.
- La impresora y el cajón: dependen del equipo que se lleve.
