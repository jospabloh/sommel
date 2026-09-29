// Content of the in-app user manual (module 21), as data so it is easy to
// update without touching the component. Only features that exist today are
// described; when a screen changes, change its entry here in the same PR.
// Plain "como hago..." Spanish for the bar's staff, no jerga, no long dashes.
// `keywords` widen the search beyond the visible words (synonyms people type).
//
// Date of the last human read-through of this text. Bump it when someone
// re-reads the manual against the app.
export const MANUAL_LAST_REVIEWED = '2026-09-29';

export const MANUAL_SECTIONS = [
  {
    id: 'mesas',
    title: 'Mesas y comandas',
    summary: 'Abrir una mesa, tomar la orden y mandarla a cocina y barra.',
    keywords: ['orden', 'pedido', 'mesero', 'para llevar', 'mover', 'unir', 'cancelar'],
    items: [
      {
        q: '¿Cómo abro una mesa?',
        a: 'Entra a Mesas y toca una mesa libre. Se abre su comanda y ahí agregas lo que pide el cliente. Si alguien más la abrió justo antes que tú, Sommel te avisa que ya está ocupada.',
      },
      {
        q: '¿Cómo tomo un pedido para llevar?',
        a: 'En Mesas toca Pedido para llevar, escribe el nombre del cliente y agrega los productos igual que en una mesa.',
      },
      {
        q: '¿Cómo agrego productos a la comanda?',
        a: 'Dentro de la comanda toca el botón para agregar, elige el producto (y sus opciones, si tiene) y confírmalo con Agregar al pedido. Puedes cambiar la cantidad o quitar un renglón mientras no lo hayas enviado.',
      },
      {
        q: '¿Qué pasa cuando toco Enviar?',
        a: 'Los renglones nuevos se mandan a la cocina o a la barra, según el producto. Desde ese momento ya no se editan: si el cliente cambia de opinión, cancela el renglón indicando el motivo o agrega otro. Esos cambios se ven marcados en la estación.',
      },
      {
        q: '¿Cómo muevo o uno mesas?',
        a: 'En el menú de la comanda elige Mover / unir mesas: puedes pasarla a otra mesa libre o juntarla con otra comanda. La comanda de origen se cancela sola al unirlas.',
      },
      {
        q: '¿Cómo cancelo una comanda?',
        a: 'Solo el administrador puede cancelar una comanda completa, y pide un motivo. No se puede cancelar si ya tiene pagos registrados: primero se anula el pago.',
      },
    ],
  },
  {
    id: 'cocina-barra',
    title: 'Cocina y barra',
    summary: 'Las estaciones donde llegan los renglones enviados.',
    keywords: ['estacion', 'listo', 'entregado', 'deshacer', 'preparar', 'cocina', 'barra'],
    items: [
      {
        q: '¿Cómo veo lo que tengo que preparar?',
        a: 'Abre Cocina o Barra en el menú. Ahí aparecen los renglones que los meseros enviaron, en tiempo real. Si hay una lista larga, usa el botón de actualizar.',
      },
      {
        q: '¿Cómo marco algo como listo?',
        a: 'Marca el platillo o bebida como listo, o toda la orden de un jalón. Cuando lo entregas puedes marcarlo como entregado.',
      },
      {
        q: '¿Me equivoqué al marcar, puedo deshacer?',
        a: 'Sí, durante los primeros 5 minutos. Pasado ese tiempo ya no se puede deshacer.',
      },
      {
        q: '¿Qué significa un aviso de cambio en un renglón?',
        a: 'Que el mesero canceló o modificó algo que ya estaba enviado. Revisa el motivo antes de seguir preparándolo.',
      },
    ],
  },
  {
    id: 'cobro',
    title: 'Cobro',
    summary: 'Cobrar una cuenta, con propina, descuento y cuenta dividida.',
    keywords: ['pagar', 'cuenta', 'propina', 'descuento', 'cortesía', 'dividir', 'cambio', 'efectivo', 'tarjeta', 'transferencia', 'ticket', 'anular'],
    items: [
      {
        q: '¿Cómo cobro una cuenta?',
        a: 'Dentro de la comanda toca Cobrar. Elige la forma de pago y captura el monto. Necesitas tener un turno abierto; si no, Sommel te pide abrirlo primero.',
      },
      {
        q: '¿Cómo cobro en efectivo y calculo el cambio?',
        a: 'Elige Efectivo, escribe cuánto te dio el cliente y Sommel calcula el cambio. Con tarjeta o transferencia solo se registra el monto.',
      },
      {
        q: '¿Cómo agrego propina?',
        a: 'En la pantalla de cobro puedes capturar la propina en monto o en porcentaje. Es opcional y se define antes del primer pago.',
      },
      {
        q: '¿Cómo hago un descuento o una cortesía?',
        a: 'En la pantalla de cobro elige descuento o cortesía y escribe el motivo, que es obligatorio. Por defecto solo el administrador puede hacerlo, y solo antes de registrar pagos.',
      },
      {
        q: '¿Cómo divido la cuenta?',
        a: 'Puedes dividirla en partes iguales o por platillos. Cada parte se cobra como un pago aparte, con su propia forma de pago, hasta cubrir el total.',
      },
      {
        q: '¿Me equivoqué en un pago, cómo lo corrijo?',
        a: 'El administrador puede anular un pago mientras el turno siga abierto. La comanda se vuelve a abrir y puedes cobrarla de nuevo.',
      },
      {
        q: '¿Cómo saco el ticket?',
        a: 'Al terminar el cobro toca Imprimir ticket. Sale en la estación de impresión de la laptop de caja. El ticket no es una factura.',
      },
    ],
  },
  {
    id: 'turno',
    title: 'Turno y corte de caja',
    summary: 'Abrir el turno, registrar salidas de efectivo y cerrar la caja.',
    keywords: ['caja', 'corte', 'fondo', 'efectivo', 'cerrar', 'abrir', 'diferencia', 'correo', 'salida', 'ciegas'],
    items: [
      {
        q: '¿Cómo abro el turno?',
        a: 'Entra a Turno, escribe el fondo con el que empieza la caja y abre. Solo puede haber un turno abierto por bar, y sin turno abierto no se puede cobrar.',
      },
      {
        q: 'Sale dinero de la caja, ¿cómo lo registro?',
        a: 'En Turno agrega una salida de efectivo con su monto y el motivo. Queda anotada en el corte.',
      },
      {
        q: '¿Cómo cierro el turno?',
        a: 'Cuenta el efectivo y captura solo lo contado: el cierre es a ciegas, Sommel no te muestra cuánto debería haber antes de que lo captures. Antes de cerrar, todas las comandas abiertas deben estar cobradas o canceladas.',
      },
      {
        q: '¿Y si hay diferencia?',
        a: 'Si lo contado no coincide con lo esperado, Sommel te pide un comentario para poder cerrar. Quien tiene permiso ve después el esperado y la diferencia.',
      },
      {
        q: '¿A dónde llega el corte?',
        a: 'Se envía por correo a las direcciones que el administrador configuró en Ajustes. Si el correo falla, el cierre queda guardado igual y quien tiene permiso puede reenviarlo o imprimirlo desde el historial.',
      },
    ],
  },
  {
    id: 'inventario',
    title: 'Inventario',
    summary: 'Existencias, entradas, merma y conteos.',
    keywords: ['insumo', 'stock', 'existencia', 'merma', 'conteo', 'entrada', 'botella', 'bajo', 'alerta'],
    items: [
      {
        q: '¿Cómo veo cuánto tengo?',
        a: 'Inventario lista cada insumo con su existencia. Los que están por debajo de su mínimo aparecen arriba como alerta.',
      },
      {
        q: '¿Cómo registro una compra o entrada?',
        a: 'Elige el insumo y registra la entrada con la cantidad. Las existencias se recalculan solas a partir de los movimientos.',
      },
      {
        q: 'Se rompió una botella, ¿cómo lo anoto?',
        a: 'Registra una merma con la cantidad y el motivo (obligatorio). Cualquier persona con acceso a Inventario puede hacerlo.',
      },
      {
        q: '¿Cómo hago un conteo físico?',
        a: 'Captura lo que contaste. Sommel registra la diferencia contra la existencia como un movimiento de conteo, sin borrar el historial.',
      },
      {
        q: '¿Cómo descuenta el inventario cuando vendo?',
        a: 'Si ligaste un producto del menú a un insumo, cada venta cobrada descuenta la cantidad que definiste. Si un renglón ya preparado se cancela, se registra como merma.',
      },
      {
        q: '¿Quién puede crear insumos y ligarlos al menú?',
        a: 'El administrador, o quien tenga el permiso de editar inventario. Los costos solo los ve quien tiene permiso de ver costos.',
      },
    ],
  },
  {
    id: 'reportes',
    title: 'Reportes',
    summary: 'Ventas por periodo, con comparativo contra el periodo anterior.',
    keywords: ['ventas', 'ticket promedio', 'hora', 'producto', 'categoría', 'costo', 'utilidad', 'propinas', 'periodo'],
    items: [
      {
        q: '¿Qué periodos puedo ver?',
        a: 'Hoy, esta semana o un rango de fechas de hasta 92 días. Cada cifra se compara contra el mismo número de días inmediatamente anteriores.',
      },
      {
        q: '¿Qué incluye el reporte?',
        a: 'Ventas, órdenes, ticket promedio, propinas, descuentos y cortesías, y desgloses por producto, categoría, persona que abrió la orden, forma de pago y hora del día. También las cancelaciones.',
      },
      {
        q: '¿Por qué no veo costo ni utilidad?',
        a: 'Esas cifras solo aparecen para quien tiene permiso de ver costos. Los productos sin costo capturado no se cuentan como costo cero: se avisan aparte.',
      },
      {
        q: '¿Qué día cuenta una venta?',
        a: 'El día local del bar (hora de Aguascalientes), de las 00:00 a las 23:59, según cuándo se cerró la cuenta.',
      },
    ],
  },
  {
    id: 'impresion',
    title: 'Impresión de tickets',
    summary: 'La estación de impresión de la laptop de caja.',
    keywords: ['ticket', 'impresora', 'termica', 'reimprimir', 'laptop', '58 mm', 'corte'],
    items: [
      {
        q: '¿Cómo funciona la impresión?',
        a: 'Los tickets y cortes se mandan a una cola. La laptop de caja tiene abierta la pantalla de Impresión, recoge cada trabajo y lo manda a la impresora de 58 mm.',
      },
      {
        q: '¿Qué debo hacer en la laptop de caja?',
        a: 'Deja abierta la pantalla de Impresión durante el servicio. Por defecto Imprimir automáticamente está apagado y cada trabajo se imprime con su botón; enciéndelo cuando ya hayas probado que tu impresora responde bien.',
      },
      {
        q: 'Un ticket no salió o salió mal',
        a: 'En la cola de Impresión reintenta el trabajo fallido o reimprime uno ya impreso.',
      },
    ],
  },
  {
    id: 'checador',
    title: 'Checador y asistencia',
    summary: 'Entrada y salida del equipo con PIN.',
    keywords: ['pin', 'entrada', 'salida', 'horas', 'asistencia', 'checar', 'bloqueado', 'olvide'],
    items: [
      {
        q: '¿Cómo registro mi entrada y mi salida?',
        a: 'Abre Checador, elige tu nombre y captura tu PIN. Si estabas fuera, se registra tu entrada; si estabas dentro, tu salida.',
      },
      {
        q: '¿Cómo creo mi PIN?',
        a: 'La primera vez, el Checador te pide crear un PIN de 4 a 6 números. Para cambiarlo después necesitas escribir el actual.',
      },
      {
        q: 'Escribí mal mi PIN varias veces',
        a: 'Después de 5 intentos fallidos seguidos, el PIN se bloquea por 15 minutos. Si lo olvidaste, pide al administrador que lo restablezca y crea uno nuevo.',
      },
      {
        q: 'Olvidé checar mi salida',
        a: 'Avisa al administrador: en Asistencia puede corregir la hora y debe dejar una nota con el motivo. La corrección queda registrada.',
      },
      {
        q: '¿Quién ve las horas?',
        a: 'Cada persona ve las suyas. El administrador ve las de todo el equipo, con el total de horas por persona.',
      },
    ],
  },
  {
    id: 'equipo',
    title: 'Equipo y permisos',
    summary: 'Invitar personal, cambiar roles y decidir qué puede hacer cada quien.',
    keywords: ['staff', 'invitar', 'rol', 'administrador', 'quitar', 'permisos', 'correo', 'invitacion'],
    items: [
      {
        q: '¿Cómo invito a alguien?',
        a: 'En Staff escribe su correo y toca Invitar. Si aún no tiene cuenta, se une a tu bar en cuanto la cree con ese mismo correo. Si ya la tiene, le llega un correo para entrar.',
      },
      {
        q: '¿Cuál es la diferencia entre administrador y staff?',
        a: 'El administrador puede todo lo del bar. El staff opera el día a día (mesas, cobro, turno, checador, inventario básico) y no ve reportes ni ajustes, ni puede dar descuentos o anular pagos, salvo que se le permita.',
      },
      {
        q: '¿Cómo cambio el rol de alguien o lo quito del equipo?',
        a: 'En Staff, en el renglón de la persona. Un bar siempre debe conservar al menos un administrador, así que Sommel no deja quitar ni degradar al último.',
      },
      {
        q: '¿Cómo cambio lo que puede hacer el staff?',
        a: 'El administrador ajusta los permisos del rol staff en la pantalla de Permisos. Cada cambio se guarda al momento; el personal lo ve la próxima vez que abra la app, y el servidor lo comprueba en cada acción.',
      },
      {
        q: 'El correo de mi código de acceso llegó en inglés',
        a: 'Es normal: los correos de verificación y de cambio de contraseña los envía la plataforma y por ahora solo salen en inglés. El código funciona igual.',
      },
    ],
  },
  {
    id: 'ajustes',
    title: 'Ajustes del bar',
    summary: 'Datos del ticket, formas de pago y correos del corte.',
    keywords: ['ticket', 'encabezado', 'pie', 'rfc', 'direccion', 'formas de pago', 'vales', 'correos', 'corte', 'configuracion'],
    items: [
      {
        q: '¿Qué puedo configurar?',
        a: 'Los datos que salen en el ticket (dirección, RFC, encabezado y pie), las formas de pago que aceptas y los correos que reciben el corte de caja. Es solo para el administrador.',
      },
      {
        q: '¿Cómo agrego una forma de pago, por ejemplo vales?',
        a: 'En Ajustes agrégala con su nombre y marca si es efectivo. Siempre debe haber al menos una activa y una de efectivo.',
      },
      {
        q: 'Mi corte no me llega por correo',
        a: 'Revisa que tu correo esté en la lista de correos del corte en Ajustes. Sin destinatarios, el corte se guarda pero no se envía; puedes reenviarlo después desde Turno.',
      },
    ],
  },
  {
    id: 'cuenta',
    title: 'Mi cuenta y la prueba',
    summary: 'Prueba gratuita, licencia, sesiones, exportar o dar de baja el bar, y a quién pedir ayuda.',
    keywords: ['prueba', 'licencia', 'suspendido', 'solo lectura', 'vencimiento', 'soporte', 'ayuda', 'tema', 'oscuro', 'cuenta', 'sesiones', 'exportar', 'baja', 'ceder', 'version', 'actualizacion'],
    items: [
      {
        q: '¿Qué significa el aviso de prueba, solo lectura o suspendido?',
        a: 'Es el estado de la licencia de tu bar. En prueba ves los días que faltan. En solo lectura o suspendido puedes entrar y consultar, pero no guardar cambios hasta regularizar. El aviso trae el correo de soporte.',
      },
      {
        q: '¿Cómo cambio entre modo claro y oscuro?',
        a: 'Con el botón redondo de la esquina de la pantalla. Elige Claro, Oscuro o Sistema, que sigue el modo de tu dispositivo.',
      },
      {
        q: '¿Dónde veo mi licencia y mis sesiones activas?',
        a: 'En Cuenta, abierta para todo el equipo. Ahí ves el estado de la licencia y los dispositivos con tu sesión abierta, y puedes cerrar cualquiera. El administrador también ve las sesiones del equipo. Por seguridad, la sesión se cierra tras un rato sin actividad y antes te avisa.',
      },
      {
        q: '¿Cómo exporto los datos de mi bar?',
        a: 'En Cuenta, Descargar. Recibes un archivo con menú, pedidos, pagos, turnos, inventario y asistencia; funciona aunque la licencia esté vencida. Si tu permiso no incluye ver costos, el archivo sale sin ellos.',
      },
      {
        q: '¿Cómo cedo el bar o lo doy de baja?',
        a: 'Solo el dueño, en Cuenta. Ceder el bar lo pasa a otro administrador. Dar de baja archiva el bar y el equipo pierde el acceso; los pedidos, pagos, turnos y asistencia se conservan cinco años por obligación fiscal. Quien no es dueño puede eliminar solo su cuenta, y su historial se queda con el bar. Cada baja genera un aviso a ACACIA.',
      },
      {
        q: '¿Cómo abro un ticket de soporte?',
        a: 'En Soporte dentro de Sommel: elige el tipo, escribe el asunto y el detalle, y envía. Ahí mismo ves si sigue enviado o ya está resuelto.',
      },
      {
        q: 'Me apareció un aviso de versión nueva',
        a: 'Toca Recargar en el aviso para cargar la última versión. Si estás en medio de un cobro, termínalo primero. En Acerca de ves la versión y las novedades.',
      },
      {
        q: '¿Con quién hablo si algo falla?',
        a: 'Abre un ticket en Soporte, escribe a soporte@acaciaco.com.mx o por WhatsApp al +52 449 895 8291. Los dos últimos aparecen también al final de esta pantalla.',
      },
    ],
  },
];

const strip = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Search terms typed by the user, accent- and case-insensitive. */
export function searchTerms(query) {
  return strip(query).split(/\s+/).filter(Boolean);
}

/**
 * Filters the manual by a free-text query. Every term must appear somewhere in
 * a question, its answer, or its section's title/keywords. Returns only the
 * sections that still have items; with an empty query returns everything.
 */
export function filterManual(query, sections = MANUAL_SECTIONS) {
  const terms = searchTerms(query);
  if (!terms.length) return sections;
  const out = [];
  for (const section of sections) {
    const sectionText = strip([section.title, section.summary, ...(section.keywords ?? [])].join(' '));
    const items = section.items.filter((item) => {
      const text = `${sectionText} ${strip(item.q)} ${strip(item.a)}`;
      return terms.every((t) => text.includes(t));
    });
    if (items.length) out.push({ ...section, items });
  }
  return out;
}
