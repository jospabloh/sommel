-- Fields Base44 gained after phase 1 (2026-10-14/15), mirrored from
-- base44/entities/*.jsonc. `npm run check:supabase-schema` fails if the
-- entity files and these migrations drift again.
--
-- 1. order_item.idempotency_key: `batch_key:index`, set by orders.addItems so a
--    retried batch never creates its lines twice. On Base44 the duplicate is
--    created and then neutralised; here a partial unique index refuses it.
-- 2. orders.cancelled_by: who cancelled the whole order (orders.cancelOrder);
--    an email or a system label, text like every other *_by column (D5).
-- 3. inventory_item.archived_at: the supply was retired (inventory.archiveItem);
--    the row and its movements stay for history and waste reports.

alter table public.order_item
  add column if not exists idempotency_key text;

create unique index if not exists order_item_idem_key on public.order_item (tenant_id, idempotency_key)
  where idempotency_key is not null and idempotency_key <> '';

alter table public.orders
  add column if not exists cancelled_by text;

alter table public.inventory_item
  add column if not exists archived_at timestamptz;
