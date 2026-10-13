/**
 * Sommel: single source of truth for the app version (modules 6 and 21).
 *
 * APP_VERSION, RELEASE_DATE and CHANGELOG are written ONLY by
 * scripts/publish-release.mjs (npm run release, run by
 * .github/workflows/auto-release-pr.yml on every push to main). Do not
 * hand-edit them per feature commit: the release PR is the only writer, and
 * `npm run check:version` (part of `npm run lint`) fails when this file and
 * package.json drift. `build` validates; `release` generates.
 *
 * The release script rewrites these exports by regex, so keep the two `export
 * const` lines below and the `export const CHANGELOG = [` opener exactly as
 * they are. Newest entry first. Every entry is written in user language.
 */
export const APP_VERSION = "0.15.1";

export const RELEASE_DATE = "2026-10-09";

// Public contact channels. Not secrets. The same email lives in
// src/lib/billingNotice.js (SUPPORT_EMAIL); the WhatsApp line is the ACACIA
// portfolio support number.
export const SUPPORT_WHATSAPP_DISPLAY = "+52 449 895 8291";
export const SUPPORT_WHATSAPP_URL = "https://wa.me/524498958291";

// Seeded on 2026-09-29 from the merged PR history of jospabloh/sommel (#5 to
// #14, one entry per PR, versions 0.<PR number>.0). From here on the release
// script adds a patch entry per release.
export const CHANGELOG = [
  {
    version: "0.15.1",
    date: "2026-10-09",
    changes: [
      "Estándar ACACIA, ola 2: permisos, cuenta, soporte, versión, sesiones",
      "Cuenta: Sesiones activas legible a 390 px",
      "Programar purgeStaleSessions desde GitHub Actions",
      "Verificación de correo por código (Registro y Login) y endurecimiento de claimInvite",
      "acaciaControl: tickets.update, tenants.contacts y emails.sendFollowup",
      "Soporte: conversación con ACACIA, respuestas del bar y correo al responder",
      "createWineBar: roll back the bar if the creator cannot be attached as bar_admin",
      "Impresión directa por USB: sin driver, con cajón de dinero",
      "Arregla traslapes y desbordes de layout en móvil y tablet",
      "Orden: un producto recién agregado ya no aparece dos veces",
      "Impresión desde cualquier pantalla, propinas rápidas, checador por usuario, usuario visible y CLAUDE.md",
      "Diseño: modo terminal (entrar con PIN en equipos autorizados)",
      "Diseño: vista combinada \"Cocina y barra\" en el modo terminal",
      "Vista combinada \"Cocina y barra\" (/estacion/todo)",
      "CLAUDE.md: tiempo real de \"Cocina y barra\" verificado",
      "Pantalla completa e \"Instalar Sommel\" en la barra lateral",
      "Modo terminal: prueba de que el token puede crear cuentas de terminal",
      "Modo terminal, fase 2a: entrar con PIN en equipos autorizados",
      "Arregla el import que impedía publicar terminals y deja todas las funciones sin errores de tipos",
      "CLAUDE.md: verificación en producción del modo terminal",
      "Nombre propio de Sommel: \"Tu nombre\" al registrarse y el admin lo edita en Staff",
      "Foto y alertas contra el préstamo de PIN, y concurrencia (límite de Base44)",
      "Aprobación del encargado con PIN (cuatro acciones de personal)",
      "Menú: una sola entrada \"Cocina y barra\"; descuentos con aprobación del encargado",
      "Aprobación con QR y Face ID; checador de todo el equipo en la terminal",
      "CLAUDE.md: QR con Face ID y checador de la terminal verificados en producción",
      "Fase 3 (cocina/barra y permisos por persona) + impresora por tipo de trabajo",
      "Fase 2b: personas sin correo + resultados de la prueba de carga",
      "Terminales: Base44 renombró /embed-tokens a /embed-url",
      "CLAUDE.md: fase 2b verificada en producción",
      "CLAUDE.md: fase 2b cerrada (terminal con persona sin correo verificada)",
      "Impresoras en red Star CloudPRNT (sin nada instalado en el bar)",
      "CLAUDE.md: CloudPRNT simulado contra producción tras publicar",
      "Quita super_admin del enum y registra pendientes cerrados contra producción",
      "Checador en celular: el selector de tema ya no tapa \"Listo\"",
      "Selector de tema en la barra lateral: ya no tapa mesas ni Reimprimir",
      "CLAUDE.md: seguimiento con Alby",
      "CLAUDE.md: seguimiento a Alby del 2026-10-08",
      "CLAUDE.md: respuestas de Alby y cómo se traducen a Sommel",
      "CLAUDE.md: mensaje a Alby sobre el cierre de turno",
      "ci: acciones de los workflows a sus versiones en Node 24",
      "CLAUDE.md: correos a los bares encendidos y acciones en Node 24",
    ],
  },
  {
    version: "0.15.0",
    date: "2026-09-29",
    changes: [
      "Permisos del equipo: el administrador decide qué puede hacer el personal desde una pantalla nueva",
      "Soporte desde la app: abre un ticket y mira su estado sin salir de Sommel",
      "Acerca de: versión, novedades y manual de usuario con búsqueda",
      "Cuenta: licencia, sesiones activas y cierre de sesión por inactividad",
      "Exportar los datos del bar, ceder el bar a otro administrador y darlo de baja conservando pedidos y pagos",
      "Aviso cuando hay una versión nueva de la app",
    ],
  },
  {
    version: "0.14.0",
    date: "2026-09-29",
    changes: [
      "Pantallas de acceso nuevas: inicio de sesión, registro y recuperación de contraseña con mensajes claros",
      "Modo claro, oscuro o el del dispositivo, con un selector en la esquina de la pantalla",
      "Aviso en pantalla cuando el bar está en prueba, en solo lectura o suspendido",
      "Los permisos del equipo ahora se comprueban también en el servidor",
      "Más protección para los datos de cada bar y conexión segura con el panel de ACACIA",
    ],
  },
  {
    version: "0.13.0",
    date: "2026-09-28",
    changes: [
      "Checador: cada persona registra su entrada y su salida con su propio PIN",
      "Asistencia: el administrador ve las horas del equipo y corrige una salida olvidada con una nota",
      "Ahora puedes quitar a alguien del equipo y cambiarle el rol",
      "Avisos de que los correos de código de acceso pueden llegar en inglés",
    ],
  },
  {
    version: "0.12.0",
    date: "2026-09-28",
    changes: [
      "Todos los correos de Sommel salen con el mismo diseño y la firma de ACACIA Consultoría",
      "La invitación al equipo ahora la manda Sommel, con instrucciones claras para entrar",
    ],
  },
  {
    version: "0.11.0",
    date: "2026-09-28",
    changes: [
      "El corte de caja por correo ahora se lee bien en el celular",
    ],
  },
  {
    version: "0.10.0",
    date: "2026-09-28",
    changes: [
      "Mensaje claro cuando se hacen demasiadas peticiones seguidas, en lugar de un error genérico",
      "Se corrigieron dos pantallas que se veían mal en celular",
    ],
  },
  {
    version: "0.9.0",
    date: "2026-09-28",
    changes: [
      "Cobro: propina, descuentos y cortesías, dividir la cuenta y varias formas de pago con cambio",
      "Turno y corte: abre con fondo, registra salidas de efectivo y cierra contando la caja a ciegas",
      "El corte se envía por correo a quien tú indiques",
      "Inventario: existencias, entradas, merma, conteos y aviso de bajo stock",
      "Impresión de tickets desde la laptop de caja",
      "Reportes de ventas por producto, categoría, persona, forma de pago y hora, con comparativo",
    ],
  },
  {
    version: "0.8.0",
    date: "2026-09-28",
    changes: [
      "Primera versión del cobro, el turno y el corte, el inventario, la impresión y los reportes (en desarrollo)",
    ],
  },
  {
    version: "0.7.0",
    date: "2026-09-28",
    changes: [
      "Invitaciones al equipo: la persona invitada se une al bar en cuanto crea su cuenta con ese correo",
    ],
  },
  {
    version: "0.6.0",
    date: "2026-09-28",
    changes: [
      "Correcciones a comandas, mesas y estaciones de cocina y barra tras probarlas de punta a punta",
    ],
  },
  {
    version: "0.5.0",
    date: "2026-09-28",
    changes: [
      "Nuevo Sommel: menú, mesas, comandas y estaciones de cocina y barra sobre un modelo de datos nuevo",
      "Cada bar ve solo su propia información",
    ],
  },
];
