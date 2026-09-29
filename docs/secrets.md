# Secretos y configuración

**Solo nombres. Nunca valores** en este repo, en un commit, en un log ni en un
mensaje. Los secretos viven en el panel de Base44 (o en su API de secretos) y se
leen de vuelta después de ponerlos.

Lectura del 2026-09-29 (API de secretos de la app `6ab41c2a89f592a0eca074d2`,
solo lectura): la lista está **vacía (`{}`)**. Ningún secreto está configurado.

| Secreto | Para qué | Quién lo lee | Estado |
|---|---|---|---|
| `INGEST_HMAC_SECRET` | Maestro compartido con Mission Control; de él se deriva la llave de cada app (`HMAC-SHA256(maestro, "acacia.app.v1." + slug)`) | `acaciaControl` | **NO CONFIGURADO** |
| `ACACIA_APP_SLUG` | Debe ser `sommel`, idéntico al `apps.id` de Mission Control (minúsculas, sin sufijo) | `acaciaControl` | **NO CONFIGURADO** |
| `PLATFORM_OWNER_EMAIL` | Reservado. El código actual decide "plataforma" por `role: admin` integrado, no por este correo | (ninguno hoy) | NO CONFIGURADO |
| `CRON_SECRET` | Reservado para `purgeStaleSessions` (ola 2). Debe fallar cerrado (503) si falta | (ninguno hoy) | NO CONFIGURADO |
| `ACACIA_MC_INGEST_URL` | No aplica: el aviso de tickets usa `ticket-pull` (sin firma, sin secreto) | n/a | NO APLICA |

`grep Deno.env` sobre `base44/functions` (2026-09-29) encuentra solo dos lecturas,
las dos en `acaciaControl/entry.ts`: `INGEST_HMAC_SECRET` y `ACACIA_APP_SLUG`.

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
