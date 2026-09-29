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
export const APP_VERSION = "0.15.0";

export const RELEASE_DATE = "2026-09-29";

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
