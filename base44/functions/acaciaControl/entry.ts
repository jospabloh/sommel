import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import {
  COUNT_CAP,
  LICENSE_ENTITY,
  SESSION_ENTITY,
  TICKET_ENTITY,
  appendResponse,
  authorizeBridge,
  barContacts,
  checkFollowup,
  cleanRevokeIds,
  countByField,
  entityError,
  isUsageEntity,
  projectWineBar,
  revokePatch,
  sanitizeLicensePatch,
  sanitizeTicketUpdate,
  usageEntities,
} from './_bridge_logic.ts';
import { buildReplyEmail } from './_reply_email.ts';

// acaciaControl: the ACACIA Mission Control bridge for Sommel (standard modules
// 5 and 15). Mission Control calls this over an HMAC-signed body, no user
// token: { action, params, ts, sig }. The signature is checked against THIS
// app's derived key (INGEST_HMAC_SECRET + ACACIA_APP_SLUG, see _acaciaSign.ts).
//
// Fail closed: while either secret is unset every call answers 503 and nothing
// is read or written. Secret values are never logged or returned.
//
// Sommel is single-tenant-per-bar and its entity names are fixed, so unlike a
// generic bridge the entity Mission Control names in `params.entity` is checked
// against the one this action may touch (see _bridge_logic.ts).
//
// Actions: ping, license.get, licenses.list, license.set, tenants, tickets.list,
// tickets.update (status + ACACIA reply), tenants.contacts, emails.sendFollowup,
// usage.summary (alias usage), usage.byTenant, sessions.list, sessions.revoke.
// Not implemented on purpose: tickets.thread (the conversation is inline on
// the ticket, `responses`, so Mission Control reads it from the synced row),
// emails.status (no email log entity). They answer 400 unknown action.
export default async function(req: Request): Promise<Response> {
  try {
    const body = await req.json().catch(() => ({}));
    const gate = await authorizeBridge(
      { secret: Deno.env.get('INGEST_HMAC_SECRET'), slug: Deno.env.get('ACACIA_APP_SLUG') },
      body,
    );
    if (!gate.ok) return Response.json({ error: gate.error, code: gate.code }, { status: gate.status });
    const { action, params } = gate;

    const base44 = createClientFromRequest(req);
    const sr = base44.asServiceRole;

    switch (action) {
      case 'ping': {
        // A real round-trip to the store, so "ok" means the backend can read.
        try {
          await sr.entities.WineBar.list('-created_date', 1);
          return Response.json({ ok: true, pong: true });
        } catch (e) {
          console.error('acaciaControl ping: store read failed', (e as Error).message);
          return Response.json({ ok: false, error: 'store_unreachable' }, { status: 503 });
        }
      }

      case 'licenses.list':
      case 'tenants': {
        if (action === 'licenses.list') {
          const bad = entityError(LICENSE_ENTITY, params.entity);
          if (bad) return Response.json({ error: bad }, { status: 400 });
        }
        const rows = await sr.entities.WineBar.list('-created_date', COUNT_CAP);
        return Response.json({ ok: true, records: rows.map(projectWineBar) });
      }

      case 'license.get': {
        const id = params.id;
        if (typeof id !== 'string' || !id) return Response.json({ error: 'params.id required' }, { status: 400 });
        const [bar] = await sr.entities.WineBar.filter({ id });
        if (!bar) return Response.json({ error: 'not found' }, { status: 404 });
        return Response.json({ ok: true, record: projectWineBar(bar) });
      }

      case 'license.set': {
        // Only the four platform-owned WineBar fields, validated. `log` and
        // `mirror` (other apps' audit row / User mirror) do not apply here.
        const bad = entityError(LICENSE_ENTITY, params.entity);
        if (bad) return Response.json({ error: bad }, { status: 400 });
        const id = params.id;
        if (typeof id !== 'string' || !id) return Response.json({ error: 'params.id required' }, { status: 400 });
        const checked = sanitizeLicensePatch(params.patch);
        if ('error' in checked) return Response.json({ error: checked.error }, { status: 400 });
        const [bar] = await sr.entities.WineBar.filter({ id });
        if (!bar) return Response.json({ error: 'not found' }, { status: 404 });
        const updated = await sr.entities.WineBar.update(id, checked.patch);
        return Response.json({ ok: true, updated: projectWineBar(updated ?? { ...bar, ...checked.patch }) });
      }

      case 'tickets.list': {
        const bad = entityError(TICKET_ENTITY, params.entity);
        if (bad) return Response.json({ error: bad }, { status: 400 });
        const records = await sr.entities.SupportTicket.list('-created_date', COUNT_CAP);
        return Response.json({ ok: true, records });
      }

      case 'tickets.update': {
        // Status / activity, plus at most one reply as ACACIA appended to
        // `responses`. The bar gets an email when a reply lands (best effort:
        // a failed email never fails the reply, which is already saved).
        const checked = sanitizeTicketUpdate(params);
        if ('error' in checked) return Response.json({ error: checked.error }, { status: 400 });
        const [ticket] = await sr.entities.SupportTicket.filter({ id: checked.id });
        if (!ticket) return Response.json({ error: 'not found' }, { status: 404 });
        const patch: Record<string, unknown> = { ...checked.patch };
        if (checked.reply) {
          const next = appendResponse(ticket.responses, checked.reply);
          if ('error' in next) return Response.json({ error: next.error }, { status: 409 });
          patch.responses = next;
        }
        const updated = await sr.entities.SupportTicket.update(checked.id, patch);
        let email_sent = false;
        if (checked.reply && ticket.tenant_id) {
          try {
            const [bars, admins] = await Promise.all([
              sr.entities.WineBar.filter({ id: ticket.tenant_id }),
              sr.entities.User.filter({ tenant_id: ticket.tenant_id, app_role: 'bar_admin' }),
            ]);
            const [contact] = barContacts(bars, admins);
            if (contact?.email) {
              const mail = buildReplyEmail({ barName: contact.name ?? '', ticketSubject: ticket.subject ?? '', replyBody: checked.reply.body });
              await sr.integrations.Core.SendEmail({ to: contact.email, subject: mail.subject, body: mail.body });
              email_sent = true;
            }
          } catch (e) {
            console.error('acaciaControl tickets.update: reply email failed', (e as Error).message);
          }
        }
        return Response.json({ ok: true, updated: updated ?? { ...ticket, ...patch }, email_sent });
      }

      case 'tenants.contacts': {
        // One contact per live bar (owner, else oldest bar_admin). Read-only.
        const bad = entityError(LICENSE_ENTITY, params.entity);
        if (bad) return Response.json({ error: bad }, { status: 400 });
        const [bars, admins] = await Promise.all([
          sr.entities.WineBar.list('-created_date', COUNT_CAP),
          sr.entities.User.filter({ app_role: 'bar_admin' }),
        ]);
        return Response.json({ ok: true, contacts: barContacts(bars, admins) });
      }

      case 'emails.sendFollowup': {
        // Mission Control owns the content; this only sends it, and only to an
        // allowed recipient (checkFollowup). The owner gets a copy of what goes
        // to a bar; an internal notice is already addressed to ACACIA.
        const owner = Deno.env.get('PLATFORM_OWNER_EMAIL') ?? '';
        const support = Deno.env.get('APP_SUPPORT_EMAIL') ?? '';
        let contacts: string[] = [];
        if (params.internal !== true) {
          const [bars, admins] = await Promise.all([
            sr.entities.WineBar.list('-created_date', COUNT_CAP),
            sr.entities.User.filter({ app_role: 'bar_admin' }),
          ]);
          contacts = barContacts(bars, admins).map((c) => c.email ?? '').filter(Boolean);
        }
        const checked = checkFollowup(params, { internal: [owner, support].filter(Boolean), contacts });
        if ('error' in checked) return Response.json({ error: checked.error }, { status: checked.status });
        await sr.integrations.Core.SendEmail({ to: checked.to, subject: checked.subject, body: checked.html, from_name: 'ACACIA' });
        const sent_at = new Date().toISOString();
        if (!checked.internal && owner && owner.toLowerCase() !== checked.to) {
          try {
            await sr.integrations.Core.SendEmail({ to: owner, subject: `[Copia → ${checked.to}] ${checked.subject}`, body: checked.html, from_name: 'ACACIA' });
          } catch { /* the owner copy never fails the bar's send */ }
        }
        return Response.json({ ok: true, sent_at, recipient: checked.to });
      }

      case 'usage':
      case 'usage.summary': {
        const counts: Record<string, number | null> = {};
        for (const e of usageEntities(params.entities)) {
          if (!isUsageEntity(e)) { counts[e] = null; continue; }
          try {
            counts[e] = (await sr.entities[e].list('-created_date', COUNT_CAP)).length;
          } catch {
            counts[e] = null; // entity missing or unreadable
          }
        }
        return Response.json({ ok: true, counts, cap: COUNT_CAP });
      }

      case 'usage.byTenant': {
        // { tenant id, count } only, no record data. Every Sommel entity that
        // is tenant-scoped names its tenant `tenant_id`.
        const entity = params.entity;
        if (typeof entity !== 'string' || !isUsageEntity(entity) || params.tenantField !== 'tenant_id') {
          return Response.json({ error: 'params.entity/tenantField not allowed' }, { status: 400 });
        }
        const rows = await sr.entities[entity].list('-created_date', COUNT_CAP);
        return Response.json({
          ok: true, entity, field: 'tenant_id',
          top: countByField(rows, 'tenant_id'), capped: rows.length >= COUNT_CAP,
        });
      }

      case 'sessions.list': {
        const bad = entityError(SESSION_ENTITY, params.entity);
        if (bad) return Response.json({ error: bad }, { status: 400 });
        const records = await sr.entities.AppSession.list('-last_active_at', COUNT_CAP);
        return Response.json({ ok: true, records });
      }

      case 'sessions.revoke': {
        // Force-logout: stamp revoked_at; the client heartbeat logs out on it.
        const bad = entityError(SESSION_ENTITY, params.entity);
        if (bad) return Response.json({ error: bad }, { status: 400 });
        const ids = cleanRevokeIds(params.ids);
        if (ids.length === 0) return Response.json({ error: 'params.ids required' }, { status: 400 });
        const patch = revokePatch(new Date().toISOString(), params.actorEmail);
        let revoked = 0;
        for (const id of ids) {
          try { await sr.entities.AppSession.update(id, patch); revoked++; } catch { /* skip missing */ }
        }
        return Response.json({ ok: true, revoked });
      }

      default:
        return Response.json({ error: `unknown action: ${action}` }, { status: 400 });
    }
  } catch (e) {
    console.error('acaciaControl failed', (e as Error).message);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
