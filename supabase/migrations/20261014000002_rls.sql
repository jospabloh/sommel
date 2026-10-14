-- Sommel on Supabase, phase 1, part 2/2: row level security, privileges,
-- realtime. Design: docs/migracion-supabase.md section 3.2.
--
-- Model (mirrors what Base44 enforces today, see supabase/README.md):
--   * The browser (role authenticated) can READ only the tables that src/
--     reads directly (listed below, with file:line in supabase/README.md),
--     its own profile row, and INSERT support_ticket for its own bar.
--     Nothing else. Least privilege: wine_bar, payment, shift, etc. are
--     server-only; the screens that need them go through Edge Functions.
--   * Every other table is server-only: no grant and no policy for anon or
--     authenticated. The service role (Edge Functions) bypasses RLS.
--   * Two independent layers on purpose: privileges (GRANT) AND policies. If
--     someone widens a grant by mistake, RLS still denies; if someone adds a
--     policy by mistake on a table with no grant, the grant still denies.

-- ---------------------------------------------------------------------------
-- Helpers. SECURITY DEFINER with a pinned, empty search_path and fully
-- qualified names (the usual privilege-escalation hole is a mutable
-- search_path). STABLE so Postgres can cache the result per statement when
-- called as (select app.current_tenant()).
-- ---------------------------------------------------------------------------
create or replace function app.current_tenant()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.tenant_id from public.profile p where p.user_id = auth.uid()
$$;

create or replace function app.current_app_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.app_role from public.profile p where p.user_id = auth.uid()
$$;

create or replace function app.is_platform()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.is_platform from public.profile p where p.user_id = auth.uid()), false)
$$;

-- Only signed-in users and the service role can call the helpers; anon cannot.
revoke all on function app.current_tenant() from public, anon;
revoke all on function app.current_app_role() from public, anon;
revoke all on function app.is_platform() from public, anon;
grant execute on function app.current_tenant() to authenticated, service_role;
grant execute on function app.current_app_role() to authenticated, service_role;
grant execute on function app.is_platform() to authenticated, service_role;

-- Trigger functions are never called by users directly.
revoke all on function app.touch_updated_date() from public, anon, authenticated;
revoke all on function app.handle_new_user() from public, anon, authenticated;
revoke all on function app.sync_user_email() from public, anon, authenticated;

-- The policies call app.current_tenant() under the caller's privileges.
revoke all on schema app from public, anon;
grant usage on schema app to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS on EVERY table in public. Done by loop so a table added in a later
-- migration cannot be forgotten silently (and isolation.sql fails if one is).
-- ---------------------------------------------------------------------------
do $$
declare
  t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Privileges. Start from zero for the browser roles.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;
grant usage on schema public to authenticated;

-- The service role is explicit rather than relying on Supabase default ACLs.
grant all on all tables in schema public to service_role;

-- ---------------------------------------------------------------------------
-- Tenant read tables: ONLY what src/ reads directly through the entity client
-- (Mesas, Estacion, Orden, useOrderRealtime, usePrintStation, PermissionContext,
-- supportTickets). Narrower than Base44's "T-read". The role:admin branch is NOT
-- reproduced: the platform panel goes through functions with the service key.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'bar_table','orders','order_item','print_job','permission_profile','support_ticket'
  ] loop
    execute format('grant select on public.%I to authenticated', t);
    execute format(
      'create policy tenant_read on public.%I for select to authenticated
         using (tenant_id = (select app.current_tenant()))', t);
  end loop;
end $$;

-- wine_bar: server-only (settings.get / settings.billing serve it). The browser
-- never reads or writes it, so license_audit, owner_id and billing fields are
-- not exposed to staff or terminals.

-- profile: own row only. The staff list goes through manageStaff (service
-- role); no direct client read of other people exists in src/.
grant select on public.profile to authenticated;
create policy own_profile_read on public.profile
  for select to authenticated
  using (user_id = (select auth.uid()));

-- support_ticket: the only browser write (src/lib/supportTickets.js sends
-- tenant_id, kind, subject, body, status, created_by_email). The grant is
-- column-limited to exactly those six: the browser cannot set responses,
-- last_activity_at, id, timestamps, or created_by_id (it defaults to
-- auth.uid()). The policy additionally pins status to 'abierto', so a ticket
-- cannot be born closed. Replies and status changes are written by the server.
grant insert (tenant_id, kind, subject, body, status, created_by_email)
  on public.support_ticket to authenticated;
create policy own_bar_insert on public.support_ticket
  for insert to authenticated
  with check (tenant_id = (select app.current_tenant()) and status = 'abierto');

-- ---------------------------------------------------------------------------
-- Server-only tables: NO grant, NO policy for anon/authenticated. Listed here
-- only as documentation; RLS is already enabled by the loop above.
--   wine_bar, category, menu_extra, inventory_item, inventory_movement, shift,
--   cash_movement, payment, staff_invite, product, cloud_printer, staff_pin,
--   attendance, approval_log, approval_request, passkey, photo_check,
--   security_alert, terminal_device, app_session
-- Cost companions (service role only):
--   order_item_cost, inventory_item_cost, inventory_movement_cost
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Realtime: only the tables the client subscribes to (src/pages/Mesas.jsx,
-- Estacion.jsx, components/orders/useOrderRealtime.js,
-- components/printing/usePrintStation.js). Postgres Changes applies the
-- tenant_read policy per subscriber. order_item rows no longer carry
-- unit_cost, so the event payload cannot leak it. REPLICA IDENTITY stays at
-- DEFAULT on purpose: DELETE events then carry only the primary key, never
-- another row's contents.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['orders','order_item','bar_table','print_job'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
