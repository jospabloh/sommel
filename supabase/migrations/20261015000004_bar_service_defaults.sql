-- Service settings decided by José on 2026-10-15 (mirrors base44/entities/WineBar.jsonc).
--
-- 1. Products with no station are delivered on send by default; only a saved
--    false turns it off.
-- 2. Negative stock is a per-bar choice, off by default: adding a line or a
--    waste that would push a supply below zero is refused. The cobro never
--    blocks.

alter table public.wine_bar
  alter column auto_deliver_no_station set default true;

alter table public.wine_bar
  add column if not exists allow_negative_stock boolean not null default false;
