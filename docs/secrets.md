# Secretos y configuración

**Solo nombres. Nunca valores** en este repo, en un commit, en un log ni en un
mensaje. Los secretos viven en el panel de Base44 (o en su API de secretos) y se
leen de vuelta después de ponerlos.

Lectura del 2026-09-29, tarde (API de secretos de la app
`6ab41c2a89f592a0eca074d2`, solo nombres; los valores vienen enmascarados):
están `INGEST_HMAC_SECRET`, `ACACIA_APP_SLUG` y `CRON_SECRET`, además de
otros que el código no lee (`PLATFORM_OWNER_EMAIL` entre ellos; se corrigió
el nombre ese mismo día, venía como `PLATFORM_OWNER_EMAL`). La primera lectura
de ese día daba `{}`.

| Secreto | Para qué | Quién lo lee | Estado |
|---|---|---|---|
| `INGEST_HMAC_SECRET` | Maestro compartido con Mission Control; de él se deriva la llave de cada app (`HMAC-SHA256(maestro, "acacia.app.v1." + slug)`) | `acaciaControl` | Configurado |
| `ACACIA_APP_SLUG` | Debe ser `sommel`, idéntico al `apps.id` de Mission Control (minúsculas, sin sufijo) | `acaciaControl` | Configurado |
| `PLATFORM_OWNER_EMAIL` | Reservado. El código actual decide "plataforma" por `role: admin` integrado, no por este correo | (ninguno hoy) | Configurado, sin uso |
| `CRON_SECRET` | Bearer de `purgeStaleSessions`; falla cerrado (503) si falta. **También va como secreto del repo en GitHub, con el mismo valor**: lo usa `.github/workflows/purge-sessions.yml`, que es quien la programa (un workflow de Base44 no puede mandar el header) | `purgeStaleSessions` | Configurado en Base44; en GitHub, pendiente |
| `ACACIA_MC_INGEST_URL` | No aplica: el aviso de tickets usa `ticket-pull` (sin firma, sin secreto) | n/a | NO APLICA |

`grep Deno.env` sobre `base44/functions` (2026-09-29) encuentra tres lecturas:
`INGEST_HMAC_SECRET` y `ACACIA_APP_SLUG` en `acaciaControl/entry.ts`, y
`CRON_SECRET` en `purgeStaleSessions/entry.ts`.

## Fallo cerrado

Mientras falte `INGEST_HMAC_SECRET` o `ACACIA_APP_SLUG`, **toda** llamada a
`acaciaControl` responde **503 `bridge_not_configured`** antes de leer o escribir
nada. No hay modo "abierto" ni llave de respaldo. Una prueba de Deno
(`base44/tests/bridge_test.ts`) fija que la rama sin secretos rechaza. Un guardia
condicional vale lo que valga su variable de entorno, y por eso hay que releer
los secretos, no suponerlos.

## Correo: es una integración de Base44, no un secreto

Los correos (invitaciones de `manageStaff`, corte de `shifts`) salen por
`integrations.Core.SendEmail` de Base44 con el rol de servicio. **No hay clave
de Resend ni de ningún proveedor en este repo.** Si algún día se cambia a Resend,
la clave entra aquí como secreto nuevo, por nombre, y se marca "no configurado"
hasta que se ponga y se relea. El remitente lo fija Base44.

## Cómo se ponen y se comprueban (paso del operador)

1. Poner `INGEST_HMAC_SECRET` (el **mismo** valor que en Mission Control; el
   agente no puede leerlo) y `ACACIA_APP_SLUG=sommel` en el panel de Base44.
2. **Releer** la lista de secretos y comprobar que aparecen los dos nombres.
3. Publicar `acaciaControl` y verificar por contenido: sin firma debe responder
   400/401 (ya no 503).
4. Solo entonces registrar `sommel` en Mission Control y pulsar "Sincronizar
   ahora". La prueba es una sincronización **sin ninguna** línea
   `rejected the derived key` para `app=sommel` y una fila `app_health` en `ok`.
   Si el orden se invierte, cada sincronización registra errores de Sommel.

Anota abajo la fecha y el resultado de cada relectura.

| Fecha | Relectura | Resultado |
|---|---|---|
| 2026-09-29 | lista de secretos vía API | vacía |
