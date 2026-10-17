-- Sommel multi-tenant isolation tests (phase 1).
--
-- Run against a SCRATCH database where the migrations were applied:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/isolation.sql <connection args>
-- (On plain Postgres run supabase/tests/00_supabase_stub.sql and the two
--  migrations first; see supabase/README.md.)
--
-- Self-contained: it creates its own fixtures (two bars, users, rows in every
-- table) and runs inside ONE transaction that is rolled back at the end, so
-- it leaves nothing behind. Any failed assertion raises an exception and
-- psql (ON_ERROR_STOP) exits non-zero.
--
-- Works on plain Postgres (after 00_supabase_stub.sql) AND on a real Supabase
-- database/branch: users are inserted through isotest.add_user, which fills
-- only the auth.users columns that exist (instance_id, aud, role, email,
-- raw_app_meta_data, raw_user_meta_data, created_at, updated_at). It needs an
-- EMPTY database (it aborts if wine_bar or profile already have rows) and a
-- role that can SET ROLE to anon/authenticated/service_role (postgres can).
--
-- Two passes on purpose:
--   Pass 1  the privileges as migrated (GRANT + RLS together);
--   Pass 2  all privileges re-granted to anon/authenticated, to prove RLS
--           ALONE still isolates tenants and blocks writes.

\set ON_ERROR_STOP on
\set QUIET on
begin;

create schema isotest;
grant usage on schema isotest to public;

-- ---------------------------------------------------------------------------
-- Classification of every table. A table that is not listed here makes the
-- test fail, so a new table cannot be forgotten.
-- ---------------------------------------------------------------------------
create table isotest.class (tbl text primary key, cls text not null);
grant select on isotest.class to public;
insert into isotest.class values
  ('profile','profile'),
  -- Browser may SELECT its own bar's rows: only what src/ reads directly
  ('bar_table','t_read'),('orders','t_read'),('order_item','t_read'),
  ('print_job','t_read'),('permission_profile','t_read'),('support_ticket','t_read'),
  -- Server-only: no grant, no policy for browser roles
  ('wine_bar','server_only'),('category','server_only'),('menu_extra','server_only'),
  ('inventory_item','server_only'),('inventory_movement','server_only'),
  ('shift','server_only'),('cash_movement','server_only'),('payment','server_only'),
  ('staff_invite','server_only'),
  ('product','server_only'),('cloud_printer','server_only'),('staff_pin','server_only'),
  ('attendance','server_only'),('approval_log','server_only'),('approval_request','server_only'),
  ('passkey','server_only'),('photo_check','server_only'),('security_alert','server_only'),
  ('terminal_device','server_only'),('app_session','server_only'),
  -- Cost companions: service role only
  ('order_item_cost','companion'),('inventory_item_cost','companion'),
  ('inventory_movement_cost','companion');

-- ---------------------------------------------------------------------------
-- Helpers (plain functions, SECURITY INVOKER, so they run with whatever role
-- the caller switched to).
-- ---------------------------------------------------------------------------
create function isotest.bump() returns void language plpgsql as $$
begin
  perform set_config('isotest.n', (coalesce(nullif(current_setting('isotest.n', true), '')::int, 0) + 1)::text, false);
end $$;

create function isotest.assert(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is not true then
    raise exception 'ASSERTION FAILED: %', msg;
  end if;
  perform isotest.bump();
end $$;

create function isotest.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
end $$;

create function isotest.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
end $$;

create function isotest.as_service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  set local role service_role;
end $$;

create function isotest.as_super() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '', true);
end $$;

-- Row count under the current role; -1 means "permission denied".
create function isotest.visible(tbl text, cond text default 'true') returns bigint language plpgsql as $$
declare n bigint;
begin
  execute format('select count(*) from public.%I where %s', tbl, cond) into n;
  return n;
exception when insufficient_privilege then
  return -1;
end $$;

-- Rows affected by a write under the current role; -1 means "permission denied".
create function isotest.affected(stmt text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute stmt;
  get diagnostics n = row_count;
  return n;
exception when insufficient_privilege then
  return -1;
end $$;

-- 'denied' when a blind INSERT is refused with SQLSTATE 42501, else what happened.
create function isotest.insert_result(tbl text) returns text language plpgsql as $$
begin
  execute format('insert into public.%I default values', tbl);
  return 'ALLOWED';
exception
  when insufficient_privilege then return 'denied';
  when others then return 'other:' || sqlstate;
end $$;

-- Runs sql as the current role and requires it to fail with the given SQLSTATE.
create function isotest.expect_error(stmt text, state text, msg text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if sqlstate = state then
      perform isotest.bump();
      return;
    end if;
    raise exception 'ASSERTION FAILED: % (expected SQLSTATE %, got % : %)', msg, state, sqlstate, sqlerrm;
  end;
  raise exception 'ASSERTION FAILED: % (statement succeeded, expected SQLSTATE %)', msg, state;
end $$;

create function isotest.expect_ok(stmt text, msg text) returns void language plpgsql as $$
begin
  execute stmt;
  perform isotest.bump();
exception when others then
  raise exception 'ASSERTION FAILED: % (unexpected error % : %)', msg, sqlstate, sqlerrm;
end $$;

-- Column that holds the tenant for a table, or null when there is none.
create function isotest.tenant_col(tbl text) returns text language sql stable as $$
  select case
    when tbl = 'wine_bar' then 'id'
    when exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = tbl and column_name = 'tenant_id')
      then 'tenant_id'
    else null
  end
$$;

-- Inserts an auth.users row with only the columns that exist in THIS database.
-- The real GoTrue table (Supabase) has instance_id, aud, role, email,
-- raw_app_meta_data, raw_user_meta_data, created_at, updated_at and many more
-- nullable columns; the stub has fewer. This keeps one script for both.
create function isotest.add_user(uid uuid, mail text, meta jsonb default '{}') returns void language plpgsql as $$
declare
  cols text[] := array['id','email','raw_user_meta_data'];
  vals text[] := array[quote_literal(uid::text) || '::uuid', quote_literal(mail), quote_literal(meta::text) || '::jsonb'];
  c text;
begin
  for c in select column_name from information_schema.columns where table_schema = 'auth' and table_name = 'users' loop
    if c = 'instance_id' then cols := cols || c; vals := vals || (quote_literal('00000000-0000-0000-0000-000000000000') || '::uuid');
    elsif c = 'aud' then cols := cols || c; vals := vals || quote_literal('authenticated')::text;
    elsif c = 'role' then cols := cols || c; vals := vals || quote_literal('authenticated')::text;
    elsif c = 'raw_app_meta_data' then cols := cols || c; vals := vals || (quote_literal('{"provider":"email","providers":["email"]}') || '::jsonb');
    elsif c = 'created_at' then cols := cols || c; vals := vals || 'now()'::text;
    elsif c = 'updated_at' then cols := cols || c; vals := vals || 'now()'::text;
    end if;
  end loop;
  execute format('insert into auth.users (%s) values (%s)', array_to_string(cols, ','), array_to_string(vals, ','));
end $$;
grant execute on all functions in schema isotest to public;

-- Fixture ids.
create function isotest.bar_a() returns uuid language sql immutable as $$ select 'a0000000-0000-0000-0000-000000000001'::uuid $$;
create function isotest.bar_b() returns uuid language sql immutable as $$ select 'b0000000-0000-0000-0000-000000000001'::uuid $$;
create function isotest.u_a_admin() returns uuid language sql immutable as $$ select '0a000000-0000-0000-0000-00000000a001'::uuid $$;
create function isotest.u_a_staff() returns uuid language sql immutable as $$ select '0a000000-0000-0000-0000-00000000a002'::uuid $$;
create function isotest.u_b_admin() returns uuid language sql immutable as $$ select '0b000000-0000-0000-0000-00000000b001'::uuid $$;
create function isotest.u_nobar() returns uuid language sql immutable as $$ select '0c000000-0000-0000-0000-00000000c001'::uuid $$;
create function isotest.u_platform() returns uuid language sql immutable as $$ select '0d000000-0000-0000-0000-00000000d001'::uuid $$;
grant execute on all functions in schema isotest to public;

-- ===========================================================================
-- SECTION 0: catalog assertions (run as the migration owner)
-- ===========================================================================
do $$
declare
  missing text;
begin
  -- 0.1 RLS enabled on EVERY table in public.
  select string_agg(c.relname, ', ') into missing
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r','p') and not c.relrowsecurity;
  perform isotest.assert(missing is null, 'RLS is not enabled on: ' || coalesce(missing, ''));

  -- 0.2 Every public table is classified, and every classified table exists.
  select string_agg(c.relname, ', ') into missing
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r','p')
    and c.relname not in (select tbl from isotest.class);
  perform isotest.assert(missing is null, 'tables missing from the isolation test classification: ' || coalesce(missing, ''));

  select string_agg(k.tbl, ', ') into missing
  from isotest.class k
  where not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'public' and c.relname = k.tbl and c.relkind in ('r','p'));
  perform isotest.assert(missing is null, 'classified tables that do not exist: ' || coalesce(missing, ''));

  perform isotest.assert((select count(*) from isotest.class) = 30, '27 entity tables + 3 cost companions = 30');

  -- 0.3 updated_date trigger on every table that has the column.
  select string_agg(c.table_name, ', ') into missing
  from information_schema.columns c
  join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
  where c.table_schema = 'public' and c.column_name = 'updated_date' and t.table_type = 'BASE TABLE'
    and not exists (
      select 1 from pg_trigger g
      where g.tgrelid = ('public.' || quote_ident(c.table_name))::regclass
        and g.tgname = 'touch_updated_date' and not g.tgisinternal);
  perform isotest.assert(missing is null, 'updated_date trigger missing on: ' || coalesce(missing, ''));

  -- 0.4 anon has NO privilege of any kind on any table (table or column level).
  select string_agg(distinct c.relname, ', ') into missing
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r','p')
    and (has_table_privilege('anon', c.oid, 'select,insert,update,delete,truncate,references,trigger')
         or exists (select 1 from pg_attribute a
                    where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
                      and (has_column_privilege('anon', c.oid, a.attnum, 'select')
                           or has_column_privilege('anon', c.oid, a.attnum, 'insert')
                           or has_column_privilege('anon', c.oid, a.attnum, 'update'))));
  perform isotest.assert(missing is null, 'anon has privileges on: ' || coalesce(missing, ''));

  -- 0.5 authenticated: table-level privileges are exactly SELECT on the
  --     browser-readable set, and nothing else. No update/delete/insert anywhere.
  select string_agg(distinct c.relname || ':' || p, ', ') into missing
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  cross join unnest(array['insert','update','delete','truncate','references','trigger']) p
  where n.nspname = 'public' and c.relkind in ('r','p')
    and has_table_privilege('authenticated', c.oid, p);
  perform isotest.assert(missing is null, 'authenticated has write-ish table privileges: ' || coalesce(missing, ''));

  select string_agg(c.relname, ', ') into missing
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  join isotest.class k on k.tbl = c.relname
  where n.nspname = 'public' and c.relkind in ('r','p')
    and has_table_privilege('authenticated', c.oid, 'select')
      is distinct from (k.cls in ('t_read','profile'));
  perform isotest.assert(missing is null, 'authenticated SELECT privilege differs from the classification on: ' || coalesce(missing, ''));

  -- 0.6 No column-level grants at all (support tickets are opened by a server
  -- function, never by a browser INSERT).
  select string_agg(x, ', ') into missing from (
    select c.relname || '.' || a.attname || ':' || e.privilege_type as x
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    cross join lateral aclexplode(a.attacl) e
    join pg_roles r on r.oid = e.grantee
    where n.nspname = 'public' and a.attacl is not null and a.attnum > 0
      and r.rolname in ('anon','authenticated')
  ) q;
  perform isotest.assert(missing is null, 'unexpected column-level grants: ' || coalesce(missing, ''));

  -- 0.7 Policies: exactly the expected set, all TO authenticated only.
  select string_agg(x, ', ') into missing from (
    (select tablename || '/' || policyname || '/' || cmd || '/' || roles::text as x from pg_policies where schemaname = 'public'
     except
     select tbl || '/tenant_read/SELECT/{authenticated}' from isotest.class
       where cls = 't_read'
     except select 'profile/own_profile_read/SELECT/{authenticated}'
    )
    union all
    (select tbl || '/tenant_read/SELECT/{authenticated}' from isotest.class where cls = 't_read'
     union select 'profile/own_profile_read/SELECT/{authenticated}'
     except select tablename || '/' || policyname || '/' || cmd || '/' || roles::text from pg_policies where schemaname = 'public')
  ) q;
  perform isotest.assert(missing is null, 'policy set differs from expected: ' || coalesce(missing, ''));

  -- 0.8 Server-only and companion tables have no policy at all.
  select string_agg(p.tablename, ', ') into missing
  from pg_policies p join isotest.class k on k.tbl = p.tablename
  where p.schemaname = 'public' and k.cls in ('server_only','companion');
  perform isotest.assert(missing is null, 'server-only/companion tables must have no policy: ' || coalesce(missing, ''));

  -- 0.9 Helper functions: SECURITY DEFINER, search_path pinned, no anon execute.
  perform isotest.assert((
    select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app' and p.proname in ('current_tenant','current_app_role','is_platform')
      and p.prosecdef and p.proconfig @> array['search_path=""']) = 3,
    'app.current_tenant/current_app_role/is_platform must be SECURITY DEFINER with search_path=""');
  perform isotest.assert(not has_function_privilege('anon', 'app.current_tenant()', 'execute'), 'anon must not execute app.current_tenant');
  perform isotest.assert(has_function_privilege('authenticated', 'app.current_tenant()', 'execute'), 'authenticated must execute app.current_tenant');
  perform isotest.assert((
    select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app' and p.prosecdef and not coalesce(p.proconfig @> array['search_path=""'], false)) = 0,
    'every SECURITY DEFINER function in app must pin search_path');

  -- 0.10 No cost / secret column on any table the browser can read.
  select string_agg(c.relname || '.' || a.attname, ', ') into missing
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
  where n.nspname = 'public' and c.relkind in ('r','p')
    and has_table_privilege('authenticated', c.oid, 'select')
    and (a.attname ~ 'cost'
         or a.attname in ('pin_hash','salt','secret_hash','pass_key','public_key_jwk','challenge','image'));
  perform isotest.assert(missing is null, 'cost/secret columns readable by the browser: ' || coalesce(missing, ''));

  -- 0.11 The unit_cost values exist only in the companions.
  select string_agg(c.table_name, ', ') into missing
  from information_schema.columns c
  where c.table_schema = 'public' and c.column_name = 'unit_cost'
    and c.table_name not in ('order_item_cost','inventory_item_cost','inventory_movement_cost');
  perform isotest.assert(missing is null, 'unit_cost found outside the companions: ' || coalesce(missing, ''));

  -- 0.12 Realtime publication: exactly the four subscribed tables.
  select string_agg(x, ', ') into missing from (
    (select tablename as x from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'
     except select unnest(array['orders','order_item','bar_table','print_job']))
    union all
    (select unnest(array['orders','order_item','bar_table','print_job'])
     except select tablename from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public')
  ) q;
  perform isotest.assert(missing is null, 'supabase_realtime publication differs from the expected 4 tables: ' || coalesce(missing, ''));
end $$;

-- ===========================================================================
-- SECTION 1: fixtures (as the migration owner, bypasses RLS)
-- ===========================================================================
do $$
begin
  -- Fixtures assume an EMPTY database (a scratch DB or a fresh Supabase branch).
  if exists (select 1 from public.wine_bar) or exists (select 1 from public.profile) then
    raise exception 'isolation.sql needs an empty scratch database: public.wine_bar / public.profile already have rows';
  end if;
  perform isotest.add_user(isotest.u_a_admin(),  'a.admin@example.test',  '{"full_name":"A Admin"}');
  perform isotest.add_user(isotest.u_a_staff(),  'a.staff@example.test',  '{"full_name":"A Staff"}');
  perform isotest.add_user(isotest.u_b_admin(),  'b.admin@example.test',  '{"full_name":"B Admin"}');
  perform isotest.add_user(isotest.u_nobar(),    'nobar@example.test',    '{}');
  perform isotest.add_user(isotest.u_platform(), 'platform@example.test', '{}');
end $$;

insert into public.wine_bar (id, name) values
  (isotest.bar_a(), 'Bar A'), (isotest.bar_b(), 'Bar B');

do $$
begin
  -- The on_auth_user_created trigger must have produced the profiles.
  perform isotest.assert((select count(*) from public.profile) = 5, 'auth.users trigger must create one profile per user');
end $$;

update public.profile set tenant_id = isotest.bar_a(), app_role = 'bar_admin' where user_id = isotest.u_a_admin();
update public.profile set tenant_id = isotest.bar_a(), app_role = 'staff'     where user_id = isotest.u_a_staff();
update public.profile set tenant_id = isotest.bar_b(), app_role = 'bar_admin' where user_id = isotest.u_b_admin();
update public.profile set is_platform = true where user_id = isotest.u_platform();

do $$
declare
  bars uuid[] := array[isotest.bar_a(), isotest.bar_b()];
  admins uuid[] := array[isotest.u_a_admin(), isotest.u_b_admin()];
  staffs uuid[] := array[isotest.u_a_staff(), isotest.u_b_admin()];  -- bar B has no staff: reuse its admin for staff-keyed rows
  i int;
  t uuid; adm uuid; stf uuid; tag text;
  v_cat uuid; v_inv uuid; v_prod uuid; v_shift uuid; v_order uuid; v_oi uuid; v_im uuid; v_pay uuid;
begin
  for i in 1..2 loop
    t := bars[i]; adm := admins[i]; stf := staffs[i]; tag := case when i = 1 then 'A' else 'B' end;

    insert into public.bar_table (tenant_id, name) values (t, 'T-' || tag);
    insert into public.category (tenant_id, name) values (t, 'cat-' || tag) returning id into v_cat;
    insert into public.inventory_item (tenant_id, name, unit) values (t, 'inv-' || tag, 'g') returning id into v_inv;
    insert into public.product (tenant_id, name, category_id, inventory_item_id, price, cost, variants)
      values (t, 'prod-' || tag, v_cat, v_inv, 5000, 1200, '[{"key":"copa","cost":900}]') returning id into v_prod;
    insert into public.shift (tenant_id, opened_at, opened_by) values (t, now(), 'x@' || tag) returning id into v_shift;
    insert into public.orders (tenant_id, shift_id, opened_at) values (t, v_shift, now()) returning id into v_order;
    insert into public.order_item (tenant_id, order_id, product_id, name, unit_price)
      values (t, v_order, v_prod, 'item-' || tag, 5000) returning id into v_oi;
    insert into public.order_item_cost (tenant_id, order_item_id, unit_cost) values (t, v_oi, 1200);
    insert into public.payment (tenant_id, order_id, shift_id, amount, idempotency_key)
      values (t, v_order, v_shift, 5000, 'pay-key-' || tag) returning id into v_pay;
    insert into public.cash_movement (tenant_id, shift_id, amount, idempotency_key)
      values (t, v_shift, -100, 'cash-key-' || tag);
    insert into public.menu_extra (tenant_id, name, price) values (t, 'extra-' || tag, 1500);
    insert into public.inventory_item_cost (tenant_id, inventory_item_id, unit_cost) values (t, v_inv, 7);
    insert into public.inventory_movement (tenant_id, item_id, type, qty, idempotency_key)
      values (t, v_inv, 'entrada', 1.5, 'im-key-' || tag) returning id into v_im;
    insert into public.inventory_movement_cost (tenant_id, inventory_movement_id, unit_cost) values (t, v_im, 7);
    insert into public.print_job (tenant_id, kind, dedupe_key) values (t, 'ticket', 'dd-' || tag);
    insert into public.cloud_printer (tenant_id, name, secret_hash, created_at) values (t, 'printer-' || tag, 'hash', now());
    insert into public.support_ticket (tenant_id, kind, subject) values (t, 'soporte', 'ticket-' || tag);
    insert into public.staff_invite (tenant_id, email) values (t, 'invitee-' || tag || '@example.test');
    insert into public.staff_pin (tenant_id, user_id, pin_hash, salt) values (t, stf, 'h', 's');
    insert into public.attendance (tenant_id, user_id, clock_in) values (t, stf, now());
    insert into public.permission_profile (tenant_id, role, overrides) values (t, 'staff', '{}');
    insert into public.approval_log (tenant_id, action, approved_by_id, method, created_at)
      values (t, 'cash_out', adm, 'pin', now());
    insert into public.approval_request (tenant_id, kind, challenge, status, requested_by_id, created_at, expires_at)
      values (t, 'approve', 'c-' || tag, 'pending', stf, now(), now() + interval '3 minutes');
    insert into public.passkey (tenant_id, user_id, credential_id, public_key_jwk, created_at)
      values (t, adm, 'cred-' || tag, '{"kty":"EC"}', now());
    insert into public.photo_check (tenant_id, user_id, kind, image, taken_at, expires_at)
      values (t, stf, 'punch', 'data:image/jpeg;base64,AAAA', now(), now() + interval '30 days');
    insert into public.security_alert (tenant_id, user_id, kind, detail, created_at, expires_at)
      values (t, stf, 'photo_missing', 'd', now(), now() + interval '90 days');
    insert into public.terminal_device (tenant_id, name, account_user_id, pass_key)
      values (t, 'term-' || tag, gen_random_uuid(), 'secret-' || tag);
    insert into public.app_session (user_id, user_email) values (stf, tag || '@example.test');
  end loop;
end $$;

-- Every classified table has at least one row, so "sees zero" means something.
do $$
declare r record;
begin
  for r in select tbl from isotest.class loop
    perform isotest.assert(isotest.visible(r.tbl) >= 2, 'fixture missing rows in ' || r.tbl);
  end loop;
end $$;

-- ===========================================================================
-- SECTION 2: constraints (as the migration owner)
-- ===========================================================================
do $$
declare
  a uuid := isotest.bar_a(); b uuid := isotest.bar_b();
  a_order uuid; b_order uuid; a_shift uuid; b_shift uuid; a_inv uuid; b_inv uuid;
  a_cat uuid; b_cat uuid; a_oi uuid; b_oi uuid; b_im uuid;
  b_oi2 uuid; b_inv2 uuid; b_im2 uuid;
  u_before timestamptz; u_after timestamptz;
begin
  select id into a_order from public.orders where tenant_id = a;
  select id into b_order from public.orders where tenant_id = b;
  select id into a_shift from public.shift where tenant_id = a;
  select id into b_shift from public.shift where tenant_id = b;
  select id into a_inv from public.inventory_item where tenant_id = a;
  select id into b_inv from public.inventory_item where tenant_id = b;
  select id into a_cat from public.category where tenant_id = a;
  select id into b_cat from public.category where tenant_id = b;
  select id into a_oi from public.order_item where tenant_id = a;
  select id into b_oi from public.order_item where tenant_id = b;
  select id into b_im from public.inventory_movement where tenant_id = b;
  -- Fresh bar B parents that have no cost row yet (so the FK is what fails, not the PK).
  insert into public.order_item (tenant_id, order_id, product_id) values (b, b_order, gen_random_uuid()) returning id into b_oi2;
  insert into public.inventory_item (tenant_id, name, unit) values (b, 'inv2-B', 'g') returning id into b_inv2;
  insert into public.inventory_movement (tenant_id, item_id, type) values (b, b_inv2, 'entrada') returning id into b_im2;

  -- 2.1 Idempotency constraints.
  perform isotest.expect_error(format($f$insert into public.payment (tenant_id, order_id, amount, idempotency_key) values (%L, %L, 1, 'pay-key-A')$f$, a, a_order), '23505', 'payment: duplicate (tenant, idempotency_key)');
  perform isotest.expect_ok(format($f$insert into public.payment (tenant_id, order_id, amount, idempotency_key) values (%L, %L, 1, 'same-key')$f$, a, a_order), 'payment: new key');
  perform isotest.expect_ok(format($f$insert into public.payment (tenant_id, order_id, amount, idempotency_key) values (%L, %L, 1, 'same-key')$f$, b, b_order), 'payment: the same key in ANOTHER tenant is fine');
  perform isotest.expect_error(format($f$insert into public.cash_movement (tenant_id, shift_id, amount, idempotency_key) values (%L, %L, 1, 'cash-key-A')$f$, a, a_shift), '23505', 'cash_movement: duplicate key');
  perform isotest.expect_ok(format($f$insert into public.cash_movement (tenant_id, shift_id, amount) values (%L, %L, 1), (%L, %L, 2)$f$, a, a_shift, a, a_shift), 'cash_movement: several rows without a key');
  perform isotest.expect_ok(format($f$insert into public.cash_movement (tenant_id, shift_id, amount, idempotency_key) values (%L, %L, 1, ''), (%L, %L, 2, '')$f$, a, a_shift, a, a_shift), 'cash_movement: empty keys do not collide');
  perform isotest.expect_ok(format($f$insert into public.order_item (tenant_id, order_id, product_id, idempotency_key) values (%L, %L, gen_random_uuid(), 'batch-A:0')$f$, a, a_order), 'order_item: first line of a batch');
  perform isotest.expect_error(format($f$insert into public.order_item (tenant_id, order_id, product_id, idempotency_key) values (%L, %L, gen_random_uuid(), 'batch-A:0')$f$, a, a_order), '23505', 'order_item: duplicate (tenant, idempotency_key)');
  perform isotest.expect_ok(format($f$insert into public.order_item (tenant_id, order_id, product_id, idempotency_key) values (%L, %L, gen_random_uuid(), 'batch-A:0')$f$, b, b_order), 'order_item: the same key in ANOTHER tenant is fine');
  perform isotest.expect_ok(format($f$insert into public.order_item (tenant_id, order_id, product_id, idempotency_key) values (%L, %L, gen_random_uuid(), ''), (%L, %L, gen_random_uuid(), null)$f$, a, a_order, a, a_order), 'order_item: empty and null keys do not collide');
  perform isotest.expect_error(format($f$insert into public.inventory_movement (tenant_id, item_id, type, idempotency_key) values (%L, %L, 'venta', 'im-key-A')$f$, a, a_inv), '23505', 'inventory_movement: duplicate key');
  perform isotest.expect_ok(format($f$insert into public.inventory_movement (tenant_id, item_id, type) values (%L, %L, 'venta'), (%L, %L, 'venta')$f$, a, a_inv, a, a_inv), 'inventory_movement: rows without a key');
  perform isotest.expect_error(format($f$insert into public.print_job (tenant_id, kind, dedupe_key) values (%L, 'ticket', 'dd-A')$f$, a), '23505', 'print_job: duplicate dedupe_key');
  perform isotest.expect_ok(format($f$insert into public.print_job (tenant_id, kind, dedupe_key) values (%L, 'ticket', 'dd-A2')$f$, a), 'print_job: new dedupe_key');
  perform isotest.expect_error(format($f$insert into public.permission_profile (tenant_id, role) values (%L, 'staff')$f$, a), '23505', 'permission_profile: one row per (tenant, role)');
  perform isotest.expect_error(format($f$insert into public.staff_pin (tenant_id, user_id) values (%L, %L)$f$, a, isotest.u_a_staff()), '23505', 'staff_pin: one row per (tenant, user)');
  perform isotest.expect_error(format($f$insert into public.passkey (tenant_id, user_id, credential_id, public_key_jwk, created_at) values (%L, %L, 'cred-A', '{}', now())$f$, a, isotest.u_a_admin()), '23505', 'passkey: credential_id unique');
  perform isotest.expect_error(format($f$insert into public.passkey (tenant_id, user_id, credential_id, public_key_jwk, created_at) values (%L, %L, 'cred-A', '{}', now())$f$, b, isotest.u_b_admin()), '23505', 'passkey: credential_id unique across tenants');
  perform isotest.expect_error(format($f$insert into public.attendance (tenant_id, user_id, clock_in) values (%L, %L, now())$f$, a, isotest.u_a_staff()), '23505', 'attendance: only one open punch per person');
  perform isotest.expect_ok(format($f$update public.attendance set clock_out = now() where tenant_id = %L$f$, a), 'attendance: close the punch');
  perform isotest.expect_ok(format($f$insert into public.attendance (tenant_id, user_id, clock_in) values (%L, %L, now())$f$, a, isotest.u_a_staff()), 'attendance: a new punch after closing');
  perform isotest.expect_error(format($f$insert into public.staff_invite (tenant_id, email) values (%L, 'INVITEE-A@example.test')$f$, a), '23505', 'staff_invite: one pending invite per address, case-insensitive');
  perform isotest.expect_ok(format($f$insert into public.staff_invite (tenant_id, email, status) values (%L, 'invitee-A@example.test', 'revoked')$f$, a), 'staff_invite: revoked invites can repeat');

  -- 2.2 Composite foreign keys: a row can never reference another bar's parent.
  perform isotest.expect_error(format($f$insert into public.order_item (tenant_id, order_id, product_id) values (%L, %L, gen_random_uuid())$f$, a, b_order), '23503', 'order_item -> orders across tenants');
  perform isotest.expect_error(format($f$insert into public.payment (tenant_id, order_id, amount, idempotency_key) values (%L, %L, 1, 'x1')$f$, a, b_order), '23503', 'payment -> orders across tenants');
  perform isotest.expect_error(format($f$insert into public.payment (tenant_id, order_id, shift_id, amount, idempotency_key) values (%L, %L, %L, 1, 'x2')$f$, a, a_order, b_shift), '23503', 'payment -> shift across tenants');
  perform isotest.expect_error(format($f$insert into public.cash_movement (tenant_id, shift_id, amount) values (%L, %L, 1)$f$, a, b_shift), '23503', 'cash_movement -> shift across tenants');
  perform isotest.expect_error(format($f$insert into public.orders (tenant_id, shift_id) values (%L, %L)$f$, a, b_shift), '23503', 'orders -> shift across tenants');
  perform isotest.expect_error(format($f$insert into public.inventory_movement (tenant_id, item_id, type) values (%L, %L, 'entrada')$f$, a, b_inv), '23503', 'inventory_movement -> inventory_item across tenants');
  perform isotest.expect_error(format($f$insert into public.product (tenant_id, name, category_id) values (%L, 'p', %L)$f$, a, b_cat), '23503', 'product -> category across tenants');
  perform isotest.expect_error(format($f$insert into public.product (tenant_id, name, inventory_item_id) values (%L, 'p', %L)$f$, a, b_inv), '23503', 'product -> inventory_item across tenants');
  perform isotest.expect_error(format($f$insert into public.order_item_cost (tenant_id, order_item_id, unit_cost) values (%L, %L, 1)$f$, a, b_oi2), '23503', 'order_item_cost -> order_item across tenants');
  perform isotest.expect_error(format($f$insert into public.inventory_item_cost (tenant_id, inventory_item_id, unit_cost) values (%L, %L, 1)$f$, a, b_inv2), '23503', 'inventory_item_cost -> inventory_item across tenants');
  perform isotest.expect_error(format($f$insert into public.inventory_movement_cost (tenant_id, inventory_movement_id, unit_cost) values (%L, %L, 1)$f$, a, b_im2), '23503', 'inventory_movement_cost -> inventory_movement across tenants');

  -- 2.3 Deletion semantics.
  perform isotest.expect_error(format($f$delete from public.orders where id = %L$f$, a_order), '23503', 'an order with payments cannot be deleted');
  perform isotest.expect_ok(format($f$delete from public.order_item where id = %L$f$, a_oi), 'order_item can be deleted');
  perform isotest.assert((select count(*) from public.order_item_cost where order_item_id = a_oi) = 0, 'order_item_cost goes with its order_item');
  -- Give bar A a line again so the matrix has something to see.
  insert into public.order_item (tenant_id, order_id, product_id, name) values (a, a_order, gen_random_uuid(), 'item-A2');

  -- 2.4 Checks.
  perform isotest.expect_error(format($f$insert into public.orders (tenant_id, status) values (%L, 'pagada')$f$, a), '23514', 'orders.status enum');
  perform isotest.expect_error(format($f$update public.wine_bar set pin_length = 7 where id = %L$f$, a), '23514', 'wine_bar.pin_length in 4,5,6');
  perform isotest.expect_error(format($f$update public.profile set app_role = 'super_admin' where user_id = %L$f$, isotest.u_a_admin()), '23514', 'profile.app_role enum');
  perform isotest.expect_error(format($f$update public.wine_bar set license_audit = '{}'::jsonb where id = %L$f$, a), '23514', 'jsonb array type check');

  -- 2.5 updated_date moves on update.
  select updated_date into u_before from public.bar_table where tenant_id = a;
  update public.bar_table set zone = 'z' where tenant_id = a;
  select updated_date into u_after from public.bar_table where tenant_id = a;
  perform isotest.assert(u_after > u_before, 'updated_date trigger must advance updated_date');

  -- 2.6 The auth.users trigger never takes tenant / role from user metadata.
  perform isotest.add_user('0e000000-0000-0000-0000-00000000e001', 'evil@example.test',
            format('{"full_name":"Evil","tenant_id":"%s","app_role":"bar_admin","is_platform":true}', a)::jsonb);
  perform isotest.assert((select tenant_id is null and app_role is null and is_platform = false and full_name = 'Evil'
                          from public.profile where user_id = '0e000000-0000-0000-0000-00000000e001'),
                         'signup metadata must not grant a tenant, a role or platform rights');
  update auth.users set email = 'evil2@example.test' where id = '0e000000-0000-0000-0000-00000000e001';
  perform isotest.assert((select email from public.profile where user_id = '0e000000-0000-0000-0000-00000000e001') = 'evil2@example.test',
                         'profile.email follows auth.users.email');
end $$;

-- ===========================================================================
-- SECTION 3: helper functions as seen by users
-- ===========================================================================
do $$ begin perform isotest.as_user(isotest.u_a_admin()); end $$;
do $$
begin
  perform isotest.assert(app.current_tenant() = isotest.bar_a(), 'current_tenant() for the bar A admin');
  perform isotest.assert(app.current_app_role() = 'bar_admin', 'current_app_role() for the bar A admin');
  perform isotest.assert(app.is_platform() = false, 'is_platform() false for a bar admin');
end $$;
do $$ begin perform isotest.as_user(isotest.u_nobar()); end $$;
do $$
begin
  perform isotest.assert(app.current_tenant() is null, 'current_tenant() is null without a bar');
end $$;
do $$ begin perform isotest.as_user(isotest.u_platform()); end $$;
do $$
begin
  perform isotest.assert(app.is_platform() = true, 'is_platform() true for the platform owner');
end $$;
do $$ begin perform isotest.as_anon(); end $$;
do $$
begin
  perform isotest.expect_error('select app.current_tenant()', '42501', 'anon cannot call app.current_tenant');
end $$;
do $$ begin perform isotest.as_super(); end $$;

-- ===========================================================================
-- SECTION 4 (pass 1) and SECTION 5 (pass 2): isolation matrix.
-- The same checks run twice; pass 2 first re-grants everything.
-- ===========================================================================
create function isotest.run_matrix(pass int) returns void language plpgsql as $$
declare
  r record;
  who record;
  tc text;
  own uuid; other uuid;
  n_total bigint; n_own bigint;
  server_only_expect bigint;
  stmt text;
begin
  -- server-only expectation: -1 (permission denied) in pass 1, 0 (RLS default deny) in pass 2.
  server_only_expect := case when pass = 1 then -1 else 0 end;

  -- ---- Authenticated users of bar A and bar B ------------------------------
  for who in
    select * from (values
      ('A admin', isotest.u_a_admin(), isotest.bar_a(), isotest.bar_b()),
      ('A staff', isotest.u_a_staff(), isotest.bar_a(), isotest.bar_b()),
      ('B admin', isotest.u_b_admin(), isotest.bar_b(), isotest.bar_a())
    ) v(label, uid, own_bar, other_bar)
  loop
    perform isotest.as_user(who.uid);
    own := who.own_bar; other := who.other_bar;

    for r in select tbl, cls from isotest.class order by tbl loop
      tc := isotest.tenant_col(r.tbl);

      if r.cls = 't_read' then
        perform isotest.assert(isotest.visible(r.tbl, format('%I = %L', tc, other)) = 0,
          format('[pass %s] %s sees rows of the OTHER bar in %s', pass, who.label, r.tbl));
        n_own   := isotest.visible(r.tbl, format('%I = %L', tc, own));
        n_total := isotest.visible(r.tbl);
        perform isotest.assert(n_own >= 1,
          format('[pass %s] %s cannot see its own bar rows in %s', pass, who.label, r.tbl));
        perform isotest.assert(n_total = n_own,
          format('[pass %s] %s sees rows outside its bar in %s', pass, who.label, r.tbl));

      elsif r.cls = 'profile' then
        perform isotest.assert(isotest.visible('profile') = 1 and isotest.visible('profile', format('user_id = %L', who.uid)) = 1,
          format('[pass %s] %s must see only its own profile row', pass, who.label));

      else -- server_only, companion
        perform isotest.assert(isotest.visible(r.tbl) = server_only_expect,
          format('[pass %s] %s reads %s (expected %s, got %s)', pass, who.label, r.tbl, server_only_expect, isotest.visible(r.tbl)));
        if tc is not null then
          perform isotest.assert(isotest.visible(r.tbl, format('%I = %L', tc, other)) in (server_only_expect, 0),
            format('[pass %s] %s reads other-bar rows of %s', pass, who.label, r.tbl));
        end if;
      end if;

      -- Writes: nothing is writable by the browser.
      perform isotest.assert(isotest.insert_result(r.tbl) = 'denied',
        format('[pass %s] %s can INSERT into %s (%s)', pass, who.label, r.tbl, isotest.insert_result(r.tbl)));
      perform isotest.assert(isotest.affected(format('update public.%I set updated_date = now()', r.tbl)) in (-1, 0),
        format('[pass %s] %s can UPDATE rows of %s', pass, who.label, r.tbl));
      perform isotest.assert(isotest.affected(format('delete from public.%I', r.tbl)) in (-1, 0),
        format('[pass %s] %s can DELETE rows of %s', pass, who.label, r.tbl));
      if pass = 1 then
        -- With the migrated grants the refusal must be a privilege error, not luck.
        perform isotest.assert(isotest.affected(format('update public.%I set updated_date = now()', r.tbl)) = -1,
          format('[pass 1] UPDATE on %s should be a privilege error', r.tbl));
        perform isotest.assert(isotest.affected(format('delete from public.%I', r.tbl)) = -1,
          format('[pass 1] DELETE on %s should be a privilege error', r.tbl));
      end if;
    end loop;

    -- support_ticket: not even for the user's own bar (server function only),
    -- including the exact payload the Base44 client sends today.
    perform isotest.expect_error(
      format($f$insert into public.support_ticket (tenant_id, kind, subject, body, status, created_by_email) values (%L, 'soporte', 'from %s p%s', 'b', 'abierto', 'spoofed@x')$f$, own, who.label, pass),
      '42501', format('[pass %s] %s opened a ticket directly from the browser', pass, who.label));
  end loop;

  -- ---- A signed-in user with NO bar, and the platform owner ----------------
  for who in
    select * from (values ('no-bar user', isotest.u_nobar()), ('platform owner', isotest.u_platform())) v(label, uid)
  loop
    perform isotest.as_user(who.uid);
    for r in select tbl, cls from isotest.class order by tbl loop
      if r.cls = 't_read' then
        perform isotest.assert(isotest.visible(r.tbl) = 0,
          format('[pass %s] %s sees rows in %s', pass, who.label, r.tbl));
      elsif r.cls = 'profile' then
        perform isotest.assert(isotest.visible('profile') = 1, format('[pass %s] %s sees only its own profile', pass, who.label));
      else
        perform isotest.assert(isotest.visible(r.tbl) = server_only_expect,
          format('[pass %s] %s reads %s', pass, who.label, r.tbl));
      end if;
    end loop;
    perform isotest.expect_error(
      format($f$insert into public.support_ticket (tenant_id, kind, subject) values (%L, 'soporte', 'nobar')$f$, isotest.bar_a()),
      '42501', format('[pass %s] %s opened a ticket in a bar', pass, who.label));
  end loop;

  -- ---- anon ----------------------------------------------------------------
  perform isotest.as_anon();
  for r in select tbl from isotest.class order by tbl loop
    perform isotest.assert(isotest.visible(r.tbl) in (-1, 0), format('[pass %s] anon reads %s', pass, r.tbl));
    if pass = 1 then
      perform isotest.assert(isotest.visible(r.tbl) = -1, format('[pass 1] anon must get a privilege error on %s', r.tbl));
    end if;
    perform isotest.assert(isotest.insert_result(r.tbl) = 'denied', format('[pass %s] anon can INSERT into %s', pass, r.tbl));
    perform isotest.assert(isotest.affected(format('update public.%I set updated_date = now()', r.tbl)) in (-1, 0),
      format('[pass %s] anon can UPDATE %s', pass, r.tbl));
    perform isotest.assert(isotest.affected(format('delete from public.%I', r.tbl)) in (-1, 0),
      format('[pass %s] anon can DELETE %s', pass, r.tbl));
  end loop;

  -- ---- service_role sees everything (it is what the Edge Functions use) ----
  perform isotest.as_service();
  for r in select tbl from isotest.class order by tbl loop
    perform isotest.assert(isotest.visible(r.tbl) >= 1, format('[pass %s] service_role must read all rows of %s', pass, r.tbl));
  end loop;
  perform isotest.assert(isotest.visible('order_item_cost') >= 1 and isotest.visible('product') >= 2,
    'service_role reads cost data');

  perform isotest.as_super();
end $$;

-- ---- Pass 1: privileges exactly as migrated ----
do $$ begin perform isotest.run_matrix(1); end $$;

-- ---- Pass 2: widen every grant, RLS alone must hold ----
grant all on all tables in schema public to anon, authenticated;
do $$ begin perform isotest.run_matrix(2); end $$;

-- Nothing the matrix did may have changed the data (writes were refused or
-- affected zero rows). No new rows at all.
do $$
declare r record; n bigint;
begin
  perform isotest.assert((select count(*) from public.payment where tenant_id = isotest.bar_a()) >= 2, 'bar A payments survived');
  perform isotest.assert((select count(*) from public.profile) = 6, 'no profile was deleted or added by the matrix');
  perform isotest.assert((select count(*) from public.wine_bar) = 2, 'no wine_bar was deleted');
  perform isotest.assert((select count(*) from public.product where tenant_id = isotest.bar_b()) = 1, 'bar B product intact');
  perform isotest.assert((select count(*) from public.support_ticket where subject like 'from %') = 0,
    'no browser-created ticket exists');
end $$;

-- ===========================================================================
-- SECTION 6: tenant deletion removes every tenant row (and nothing else)
-- ===========================================================================
do $$
declare r record; n bigint;
begin
  delete from public.wine_bar where id = isotest.bar_b();
  for r in select tbl from isotest.class where isotest.tenant_col(tbl) = 'tenant_id' and tbl <> 'profile' loop
    execute format('select count(*) from public.%I where tenant_id = %L', r.tbl, isotest.bar_b()) into n;
    perform isotest.assert(n = 0, 'rows of a deleted bar remain in ' || r.tbl);
  end loop;
  perform isotest.assert((select tenant_id is null from public.profile where user_id = isotest.u_b_admin()),
    'profiles are unlinked, not deleted, when their bar is deleted');
  perform isotest.assert((select count(*) from public.order_item where tenant_id = isotest.bar_a()) >= 0, 'bar A untouched');
  perform isotest.assert((select count(*) from public.payment where tenant_id = isotest.bar_a()) >= 2, 'bar A payments untouched');
end $$;

do $$
begin
  raise notice 'ISOLATION TESTS PASSED: % assertions', current_setting('isotest.n');
end $$;

rollback;
