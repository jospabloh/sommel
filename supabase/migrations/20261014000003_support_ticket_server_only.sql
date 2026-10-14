-- support_ticket becomes read-only for the browser (Codex review on #84).
--
-- 0002 let a signed-in user INSERT six columns of support_ticket for their own
-- bar. RLS kept the tenant right, but the client still chose created_by_email,
-- so a ticket could claim any author. Opening a ticket now goes through a
-- server function (support.createTicket, phase 2) that derives tenant_id,
-- created_by_id and created_by_email from the session, like replies already do.
-- Reads are unchanged (tenant_read).

drop policy if exists own_bar_insert on public.support_ticket;
revoke insert (tenant_id, kind, subject, body, status, created_by_email)
  on public.support_ticket from authenticated;
revoke insert on public.support_ticket from authenticated, anon;
