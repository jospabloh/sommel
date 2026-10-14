-- Sommel on Supabase, phase 1, part 1/2: schema.
-- Source of truth for fields: base44/entities/*.jsonc (27 entities).
-- Design: docs/migracion-supabase.md section 3.1.
--
-- Conventions
--   * Field names are kept exactly as in Base44 (already snake_case) so a
--     compatibility shim can map 1:1.
--   * Every table has id uuid, created_date, updated_date (trigger-maintained)
--     and created_by_id (the Base44 built-in), except profile (keyed by
--     user_id) and the three cost companion tables (keyed by their parent id).
--   * Enums are text + CHECK (easier to evolve than Postgres enum types).
--   * Money is integer centavos. Quantities and stock are numeric (can be
--     fractional or negative, e.g. -0.4).
--   * Defaults exist only where the .jsonc declares one; NOT NULL only where
--     the .jsonc says required or declares a default. Everything else is
--     nullable, exactly as Base44 treated absent fields.
--   * Tenant consistency is enforced in the database: child rows reference
--     their parent with a COMPOSITE foreign key (tenant_id, parent_id), so a
--     row can never point at another bar's parent even if application code
--     has a bug.
--   * The browser never reads cost columns: order_item.unit_cost,
--     inventory_item.unit_cost and inventory_movement.unit_cost live in
--     companion *_cost tables. product keeps cost inline because the whole
--     product table is server-only (see README, decision D3).

-- gen_random_uuid() is built into Postgres 13+, so no extension is needed.
-- (pg_cron is deliberately NOT enabled in this phase.)

create schema if not exists app;

-- New tables must not get the Supabase default grants for browser roles.
-- (Explicit revokes and the real grants are in the next migration.)
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

-- updated_date maintenance. clock_timestamp() (not now()) so two updates in
-- one transaction still move the value forward.
create or replace function app.touch_updated_date()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_date := clock_timestamp();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- wine_bar (Base44 WineBar). The tenant.
-- ---------------------------------------------------------------------------
create table public.wine_bar (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id uuid,

  name text not null,
  address text,
  rfc text,
  ticket_header text,
  ticket_footer text,
  -- Platform-only fields (Base44 write lock): nobody in the browser writes
  -- wine_bar at all now.
  billing_status text not null default 'trial'
    check (billing_status in ('trial','active','view_only','suspended')),
  trial_end_at timestamptz,
  current_period_end timestamptz,
  plan text,
  owner_id uuid,                       -- creator's user id; no FK on purpose (survives account deletion)
  archived_at timestamptz,
  license_audit jsonb check (jsonb_typeof(license_audit) = 'array'),
  -- Bar settings.
  corte_emails text[],
  payment_methods jsonb check (jsonb_typeof(payment_methods) = 'array'),
  prep_goal_kitchen_min numeric not null default 15,
  prep_goal_bar_min numeric not null default 8,
  approval_qr_enabled boolean not null default false,
  pin_length integer not null default 4 check (pin_length in (4,5,6)),
  print_comandas boolean not null default false,
  auto_deliver_no_station boolean not null default false,
  cash_out_max integer not null default 0 check (cash_out_max >= 0),
  qty_confirm_threshold integer not null default 20 check (qty_confirm_threshold >= 0),
  service_hours jsonb check (jsonb_typeof(service_hours) = 'object')
);

-- ---------------------------------------------------------------------------
-- profile (Base44 built-in User + our custom User fields).
-- user_id is auth.users.id. Written only by the server (service role).
-- ---------------------------------------------------------------------------
create table public.profile (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id uuid,

  email text,
  full_name text,
  tenant_id uuid references public.wine_bar (id) on delete set null,
  app_role text check (app_role in ('bar_admin','staff','terminal')),
  display_name text,
  photo_check boolean not null default false,
  permission_overrides jsonb check (jsonb_typeof(permission_overrides) = 'object'),
  -- The Base44 built-in role:admin. Platform owner only.
  is_platform boolean not null default false
);
create unique index profile_email_key on public.profile (lower(email)) where email is not null;
create index profile_tenant_idx on public.profile (tenant_id);

-- ---------------------------------------------------------------------------
-- Tenant tables
-- ---------------------------------------------------------------------------

-- BarTable
create table public.bar_table (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id uuid,
  tenant_id uuid not null references public.wine_bar (id) on delete cascade,

  name text not null,
  seats integer not null default 4,
  zone text,
  x numeric,
  y numeric,
  status text not null default 'available' check (status in ('available','occupied'))
);
create index bar_table_tenant_idx on public.bar_table (tenant_id);

-- Category
create table public.category (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id uuid,
  tenant_id uuid not null references public.wine_bar (id) on delete cascade,

  name text not null,
  sort integer not null default 0,
  station_default text not null default 'none' check (station_default in ('kitchen','bar','none')),
  unique (tenant_id, id)
);
create index category_tenant_idx on public.category (tenant_id);

-- InventoryItem (unit_cost lives in inventory_item_cost)
create table public.inventory_item (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id uuid,
  tenant_id uuid not null references public.wine_bar (id) on delete cascade,

  name text not null,
  unit text not null,
  stock numeric not null default 0,
  low_threshold numeric not null default 0,
  unique (tenant_id, id)
);
create index inventory_item_tenant_idx on public.inventory_item (tenant_id);

-- Product. SERVER-ONLY table: cost and variants[].cost stay inline here.
create table public.product (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id uuid,
  tenant_id uuid not null references public.wine_bar (id) on delete cascade,

  name text not null,
  category_id uuid,
  station text not null default 'none' check (station in ('kitchen','bar','none')),
  price integer,
  cost integer,
  variants jsonb check (jsonb_typeof(variants) = 'array'),   -- [{key,label,price,cost,inventory_qty}]
  modifiers jsonb check (jsonb_typeof(modifiers) = 'array'), -- [{key,label}]
  active boolean not null default true,
  seasonal boolean not null default false,
  track_inventory boolean not null default false,
  stock_unit text check (stock_unit in ('pieza','botella','g','ml')),
  inventory_qty numeric,
  inventory_item_id uuid,
  unique (tenant_id, id),
  foreign key (tenant_id, category_id)
    references public.category (tenant_id, id) on delete set null (category_id),
  foreign key (tenant_id, inventory_item_id)
    references public.inventory_item (tenant_id, id) on delete set null (inventory_item_id)
);
create index product_tenant_updated_idx on public.product (tenant_id, updated_date desc);
create index product_category_idx on public.product (tenant_id, category_id);
create index product_inventory_item_idx on public.product (tenant_id, inventory_item_id);

-- Shift
create table public.shift (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id uuid,
  tenant_id uuid not null references public.wine_bar (id) on delete cascade,

  opened_at timestamptz,
  opened_by text,
  opening_float integer not null default 0,
  closed_at timestamptz,
  closed_by text,
  counted_cash integer,
  expected_cash integer,
  difference integer,
  close_comment text,
  email_status text not null default 'pendiente' check (email_status in ('pendiente','enviado','fallido')),
  email_sent_at timestamptz,
  email_error text,
  summary jsonb check (jsonb_typeof(summary) = 'object'),
  unique (tenant_id, id)
);
create index shift_tenant_created_idx on public.shift (tenant_id, created_date desc);

-- Order. Named "orders" (not "order") because ORDER is a reserved word; an
-- unquoted `order` would need quoting in every query, policy and shim call.
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id uuid,
  tenant_id uuid not null references public.wine_bar (id) on delete cascade,

  type text not null default 'mesa' check (type in ('mesa','llevar')),
  table_ids uuid[],                   -- bar_table ids; array, so no FK
  customer_name text,
  status text not null default 'abierta' check (status in ('abierta','cobrada','cancelada')),
  opened_by text,
  opened_at timestamptz,
  closed_at timestamptz,
  cancel_reason text,
  subtotal integer not null default 0,
  discount integer not null default 0,
  discount_reason text,
  discount_pct numeric,
  tip_pct numeric,
  discount_kind text check (discount_kind in ('descuento','cortesia')),
  tip integer not null default 0,
  total integer not null default 0,
  paid integer not null default 0,
  closed_by text,
  shift_id uuid,
  unique (tenant_id, id),
  foreign key (tenant_id, shift_id) references public.shift (tenant_id, id)
);
create index orders_tenant_status_idx on public.orders (tenant_id, status);
create index orders_tenant_status_closed_idx on public.orders (tenant_id, status, closed_at desc);
create index orders_shift_idx on public.orders (tenant_id, shift_id);

-- OrderItem (unit_cost lives in order_item_cost)
create table public.order_item (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id uuid,
  tenant_id uuid not null references public.wine_bar (id) on delete cascade,

  order_id uuid not null,
  product_id uuid not null,           -- no FK: the product may be deleted, the sold line is history
  variant text,
  variant_label text,
  name text,
  unit_price integer,
  qty numeric not null default 1,
  modifiers jsonb check (jsonb_typeof(modifiers) = 'array'),  -- [{key,label}]
  extras jsonb check (jsonb_typeof(extras) = 'array'),        -- [{id,name,price}] frozen at add time
  notes text,
  station text check (station in ('kitchen','bar','none')),
  status text not null default 'nuevo' check (status in ('nuevo','enviado','listo','entregado','cancelado')),
  sent_at timestamptz,
  ready_at timestamptz,
  cancel_reason text,
  cancelled_by text,
  prepared boolean not null default false,
  created_by text,
  unique (tenant_id, id),
  foreign key (tenant_id, order_id) references public.orders (tenant_id, id) on delete cascade
);
create index order_item_order_idx on public.order_item (tenant_id, order_id);
create index order_item_station_status_idx on public.order_item (tenant_id, station, status);

-- Payment. Financial record: the order cannot be deleted from under it.
create table public.payment (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id uuid,
  tenant_id uuid not null references public.wine_bar (id) on delete cascade,

  order_id uuid not null,
  shift_id uuid,
  method text,
  amount integer not null,
  received integer,
  change integer,
  tip integer not null default 0,
  split_label text,
  idempotency_key text not null,
  created_by text,
  method_label text,
  voided_by text,
  void_reason text,
  voided_at timestamptz,
  unique (tenant_id, id),
  -- Replaces reconcilePayments and the "neutralize duplicates" logic.
  unique (tenant_id, idempotency_key),
  foreign key (tenant_id, order_id) references public.orders (tenant_id, id),
  foreign key (tenant_id, shift_id) references public.shift (tenant_id, id)
);
create index payment_order_idx on public.payment (tenant_id, order_id);
create index payment_shift_idx on public.payment (tenant_id, shift_id);

-- CashMovement
create table public.cash_movement (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id uuid,
  tenant_id uuid not null references public.wine_bar (id) on delete cascade,

  shift_id uuid not null,
  amount integer not null,
  reason text,
  idempotency_key text,
  created_by text,
  voided_amount integer,
  voided_at timestamptz,
  voided_by text,
  void_reason text,
  unique (tenant_id, id),
  foreign key (tenant_id, shift_id) references public.shift (tenant_id, id)
);
create index cash_movement_shift_idx on public.cash_movement (tenant_id, shift_id);
create unique index cash_movement_idem_key on public.cash_movement (tenant_id, idempotency_key)
  where idempotency_key is not null and idempotency_key <> '';

-- MenuExtra
create table public.menu_extra (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id uuid,
  tenant_id uuid not null references public.wine_bar (id) on delete cascade,

  name text not null,
  price integer not null default 0,
  applies_to text not null default 'all' check (applies_to in ('all','products')),
  product_ids uuid[],
  active boolean not null default true,
  sort integer not null default 0
);
create index menu_extra_tenant_idx on public.menu_extra (tenant_id);

-- InventoryMovement (unit_cost lives in inventory_movement_cost)
create table public.inventory_movement (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id uuid,
  tenant_id uuid not null references public.wine_bar (id) on delete cascade,

  item_id uuid not null,
  type text not null check (type in ('entrada','venta','merma','conteo','devolucion')),
  qty numeric,
  reason text,
  order_item_id uuid,                 -- no FK: order lines can be removed, the stock movement stays
  idempotency_key text,
  created_by text,
  unique (tenant_id, id),
  foreign key (tenant_id, item_id) references public.inventory_item (tenant_id, id)
);
create index inventory_movement_item_idx on public.inventory_movement (tenant_id, item_id);
create index inventory_movement_created_idx on public.inventory_movement (tenant_id, created_date desc);
create unique index inventory_movement_idem_key on public.inventory_movement (tenant_id, idempotency_key)
  where idempotency_key is not null and idempotency_key <> '';

-- Cost companions: readable ONLY by the service role. A row-level policy
-- cannot hide a column and Realtime sends the whole row, so cost lives in its
-- own table that the browser has no grant on.
create table public.order_item_cost (
  order_item_id uuid primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  tenant_id uuid not null references public.wine_bar (id) on delete cascade,
  unit_cost integer,
  foreign key (tenant_id, order_item_id) references public.order_item (tenant_id, id) on delete cascade
);
create index order_item_cost_tenant_idx on public.order_item_cost (tenant_id);

create table public.inventory_item_cost (
  inventory_item_id uuid primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  tenant_id uuid not null references public.wine_bar (id) on delete cascade,
  unit_cost integer,
  foreign key (tenant_id, inventory_item_id) references public.inventory_item (tenant_id, id) on delete cascade
);
create index inventory_item_cost_tenant_idx on public.inventory_item_cost (tenant_id);

create table public.inventory_movement_cost (
  inventory_movement_id uuid primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  tenant_id uuid not null references public.wine_bar (id) on delete cascade,
  unit_cost integer,
  foreign key (tenant_id, inventory_movement_id) references public.inventory_movement (tenant_id, id) on delete cascade
);
create index inventory_movement_cost_tenant_idx on public.inventory_movement_cost (tenant_id);

-- PrintJob
create table public.print_job (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id uuid,
  tenant_id uuid not null references public.wine_bar (id) on delete cascade,

  kind text not null check (kind in ('cocina','barra','cambio','ticket','corte')),
  lines jsonb check (jsonb_typeof(lines) = 'array'),   -- [{text,align,bold,size}]
  title text,
  error text,
  source_id uuid,
  dedupe_key text not null,
  status text not null default 'pendiente' check (status in ('pendiente','reclamado','impreso','fallido')),
  claimed_by text,                    -- device id or 'cloud:<printer id>'
  claimed_at timestamptz,
  printed_at timestamptz,
  attempts integer not null default 0,
  reprint_of uuid,
  open_drawer boolean not null default false,
  -- Replaces the pre-write duplicate lookup. Claiming becomes an atomic
  -- UPDATE ... WHERE status='pendiente' RETURNING in the functions.
  unique (tenant_id, dedupe_key)
);
create index print_job_queue_idx on public.print_job (tenant_id, status, created_date);

-- CloudPrinter (server-only; secret_hash is a SHA-256 of the printer password)
create table public.cloud_printer (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id uuid,                 -- also the Base44 custom field created_by_id (creator's user id)
  tenant_id uuid not null references public.wine_bar (id) on delete cascade,

  name text not null,
  secret_hash text not null,
  kinds text[] check (kinds <@ array['cocina','barra','cambio','ticket','corte']::text[]),
  format text not null default 'starprnt' check (format in ('starprnt','text')),
  mac text,
  last_seen_at timestamptz,
  last_status text,
  created_by_name text,
  created_at timestamptz not null,
  revoked_at timestamptz
);
create index cloud_printer_tenant_idx on public.cloud_printer (tenant_id);

-- SupportTicket. The only table the browser may insert into.
create table public.support_ticket (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id uuid default auth.uid(),
  tenant_id uuid not null references public.wine_bar (id) on delete cascade,

  kind text not null check (kind in ('soporte','mejora','baja')),
  subject text not null,
  body text,
  status text not null default 'abierto' check (status in ('abierto','en_proceso','cerrado')),
  created_by_email text,
  responses jsonb check (jsonb_typeof(responses) = 'array'),  -- [{author_role,author_name,author_email,body,created_at}]
  last_activity_at timestamptz,
  -- Defense in depth for the browser insert (it is also column-limited by
  -- GRANT in the RLS migration).
  check (char_length(subject) <= 200),
  check (body is null or char_length(body) <= 4000)
);
create index support_ticket_tenant_created_idx on public.support_ticket (tenant_id, created_date desc);

-- StaffInvite
create table public.staff_invite (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id uuid,
  tenant_id uuid not null references public.wine_bar (id) on delete cascade,

  email text not null,
  app_role text not null default 'staff' check (app_role in ('staff','bar_admin')),
  status text not null default 'pending' check (status in ('pending','accepted','revoked')),
  invited_by text,
  expires_at timestamptz,
  accepted_at timestamptz,
  accepted_user_id uuid
);
create index staff_invite_tenant_status_idx on public.staff_invite (tenant_id, status);
create index staff_invite_email_idx on public.staff_invite (lower(email));
-- At most one live invitation per address and bar.
create unique index staff_invite_pending_key on public.staff_invite (tenant_id, lower(email))
  where status = 'pending';

-- StaffPin (server-only). User deletion removes the credential.
create table public.staff_pin (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id uuid,
  tenant_id uuid not null references public.wine_bar (id) on delete cascade,

  user_id uuid not null references public.profile (user_id) on delete cascade,
  pin_hash text,
  salt text,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  unique (tenant_id, user_id)
);

-- Attendance (server-only). user_id has NO foreign key: the record is a legal
-- retention record (CFF art. 30) and outlives the account.
create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id uuid,
  tenant_id uuid not null references public.wine_bar (id) on delete cascade,

  user_id uuid not null,
  user_name text,
  clock_in timestamptz not null,
  clock_out timestamptz,
  edited_by text,
  edit_note text,
  edited_at timestamptz,
  original_clock_in timestamptz,
  original_clock_out timestamptz
);
create index attendance_user_clock_idx on public.attendance (tenant_id, user_id, clock_in desc);
create index attendance_clock_idx on public.attendance (tenant_id, clock_in);
-- At most one open punch per person: replaces the "keep a survivor, delete
-- the rest" cleanup in attendance.punch.
create unique index attendance_one_open_key on public.attendance (tenant_id, user_id)
  where clock_out is null;

-- PermissionProfile
create table public.permission_profile (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id uuid,
  tenant_id uuid not null references public.wine_bar (id) on delete cascade,

  role text not null check (role in ('bar_admin','staff')),
  overrides jsonb check (jsonb_typeof(overrides) = 'object'),
  unique (tenant_id, role)
);

-- ApprovalLog (server-only, audit; no FKs to people so it outlives them)
create table public.approval_log (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id uuid,
  tenant_id uuid not null references public.wine_bar (id) on delete cascade,

  action text not null
    check (action in ('cancel_sent_item','void_payment','cash_out','void_cash_out','close_shift','discount')),
  target_id uuid,
  detail text,
  requested_by_id uuid,
  requested_by_name text,
  approved_by_id uuid not null,
  approved_by_name text,
  method text not null check (method in ('pin','passkey')),
  terminal_id uuid,
  created_at timestamptz not null
);
create index approval_log_tenant_created_idx on public.approval_log (tenant_id, created_at desc);

-- ApprovalRequest (server-only)
create table public.approval_request (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id uuid,
  tenant_id uuid not null references public.wine_bar (id) on delete cascade,

  kind text not null check (kind in ('approve','register')),
  action text,
  label text,
  challenge text not null,
  status text not null check (status in ('pending','approved','rejected','used','cancelled')),
  requested_by_id uuid not null,
  requested_by_name text,
  approved_by_id uuid,
  approved_by_name text,
  terminal_id uuid,
  created_at timestamptz not null,
  expires_at timestamptz not null,
  decided_at timestamptz,
  used_at timestamptz
);
create index approval_request_tenant_status_idx on public.approval_request (tenant_id, status);

-- Passkey (server-only; stores only the PUBLIC key)
create table public.passkey (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id uuid,
  tenant_id uuid not null references public.wine_bar (id) on delete cascade,

  user_id uuid not null references public.profile (user_id) on delete cascade,
  credential_id text not null unique,
  public_key_jwk jsonb not null check (jsonb_typeof(public_key_jwk) = 'object'),
  sign_count integer not null default 0,
  label text,
  created_at timestamptz not null,
  last_used_at timestamptz
);
create index passkey_user_idx on public.passkey (tenant_id, user_id);

-- PhotoCheck (server-only; image is a small base64 data URL, purged at 30 days)
create table public.photo_check (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id uuid,
  tenant_id uuid not null references public.wine_bar (id) on delete cascade,

  user_id uuid not null references public.profile (user_id) on delete cascade,
  user_name text,
  kind text not null check (kind in ('unlock','punch')),
  image text not null,
  terminal_id uuid,
  terminal_name text,
  attendance_id uuid,
  taken_at timestamptz not null,
  expires_at timestamptz not null
);
create index photo_check_user_idx on public.photo_check (tenant_id, user_id);
create index photo_check_expires_idx on public.photo_check (expires_at);

-- SecurityAlert (server-only; purged at 90 days)
create table public.security_alert (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id uuid,
  tenant_id uuid not null references public.wine_bar (id) on delete cascade,

  user_id uuid not null references public.profile (user_id) on delete cascade,
  user_name text,
  kind text not null check (kind in ('photo_missing','two_terminals','off_shift_unlock')),
  detail text not null,
  terminal_id uuid,
  photo_id uuid,
  created_at timestamptz not null,
  expires_at timestamptz not null,
  seen_at timestamptz,
  seen_by text
);
create index security_alert_created_idx on public.security_alert (tenant_id, created_at desc);
create index security_alert_user_idx on public.security_alert (tenant_id, user_id);
create index security_alert_expires_idx on public.security_alert (expires_at);

-- TerminalDevice (server-only). account_user_id has no FK: the synthetic
-- account is deleted on revoke while the device row is kept for history.
-- pass_key is a secret (see README open question OQ5).
create table public.terminal_device (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id uuid,
  tenant_id uuid not null references public.wine_bar (id) on delete cascade,

  name text not null,
  account_user_id uuid not null,
  account_email text,
  pass_key text not null,
  pass_epoch integer not null default 0,
  failed_unlocks integer not null default 0,
  unlock_locked_until timestamptz,
  allowed jsonb check (jsonb_typeof(allowed) = 'object'),
  activated_by_user_id uuid,
  activated_by_name text,
  last_seen_at timestamptz,
  unlocked_user_id uuid,
  unlocked_at timestamptz,
  revoked_at timestamptz,
  account_deleted_at timestamptz,
  revoked_by_user_id uuid
);
create index terminal_device_tenant_idx on public.terminal_device (tenant_id);
create index terminal_device_account_idx on public.terminal_device (account_user_id);

-- AppSession (server-only). Per user, not per bar: it has no tenant_id (the
-- Base44 entity had none either). Deleted with the user.
create table public.app_session (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by_id uuid,

  user_id uuid references public.profile (user_id) on delete cascade,
  user_email text not null,
  user_name text,
  device text,
  device_id text,
  device_name text,
  status text check (status in ('active','passive','revoked')),
  started_at timestamptz,
  last_active_at timestamptz,
  last_seen timestamptz,
  revoked_at timestamptz,
  revoked_by text
);
create index app_session_user_idx on public.app_session (user_id);

-- ---------------------------------------------------------------------------
-- updated_date trigger on every table that has the column (new tables are
-- picked up by re-running this block in their own migration; the isolation
-- test fails if one is missing).
-- ---------------------------------------------------------------------------
do $$
declare
  t record;
begin
  for t in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables tb
      on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'updated_date'
      and tb.table_type = 'BASE TABLE'
  loop
    execute format(
      'create trigger touch_updated_date before update on public.%I
         for each row execute function app.touch_updated_date()',
      t.table_name
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Profiles follow auth.users. The trigger copies ONLY the e-mail and a name
-- hint; tenant_id / app_role / is_platform are never taken from user-supplied
-- metadata. Everything else on profile is written by the server.
-- ---------------------------------------------------------------------------
create or replace function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profile (user_id, email, full_name)
  values (
    new.id,
    new.email,
    left(nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''), 200)
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create or replace function app.sync_user_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profile set email = new.email where user_id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function app.sync_user_email();
