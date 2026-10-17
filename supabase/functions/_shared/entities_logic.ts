// Pure half of the `entities` shim (docs/migracion-supabase.md §3.3): it
// translates Base44's entity calls into a plan for PostgREST and maps rows
// back to the shape the handlers already expect. Zero imports besides the
// generated column types, so `deno test` loads it without the network.
//
// Rules it encodes (supabase/README.md):
// - Entity names map to tables; `User` is `profile`, keyed by `user_id`, and
//   Base44's built-in `role` is `profile.is_platform`.
// - `unit_cost` lives in a server-only cost table (D4); the shim joins it on
//   read and writes it apart. It runs only inside Edge Functions with the
//   service key, and the handlers keep redacting it as they do today.
// - Base44 writes '' in fields that are uuid/timestamptz/number here (OQ3):
//   an empty string becomes null on those columns.
// - Base44 silently drops fields an entity does not declare; so does this.
// - A uuid column compared with something that is not a uuid matches nothing
//   (Postgres would raise 22P02 and the handler would answer 500 instead of
//   its usual 404).

import { COLUMN_TYPES } from './schema.generated.ts';

export const ENTITY_TABLE: Record<string, string> = {
  AppSession: 'app_session',
  ApprovalLog: 'approval_log',
  ApprovalRequest: 'approval_request',
  Attendance: 'attendance',
  BarTable: 'bar_table',
  CashMovement: 'cash_movement',
  Category: 'category',
  CloudPrinter: 'cloud_printer',
  InventoryItem: 'inventory_item',
  InventoryMovement: 'inventory_movement',
  MenuExtra: 'menu_extra',
  Order: 'orders',
  OrderItem: 'order_item',
  Passkey: 'passkey',
  Payment: 'payment',
  PermissionProfile: 'permission_profile',
  PhotoCheck: 'photo_check',
  PrintJob: 'print_job',
  Product: 'product',
  SecurityAlert: 'security_alert',
  Shift: 'shift',
  StaffInvite: 'staff_invite',
  StaffPin: 'staff_pin',
  SupportTicket: 'support_ticket',
  TerminalDevice: 'terminal_device',
  User: 'profile',
  WineBar: 'wine_bar',
};

// Cost tables (D4): parent table -> [cost table, its key column].
export const COST_TABLE: Record<string, [string, string]> = {
  order_item: ['order_item_cost', 'order_item_id'],
  inventory_item: ['inventory_item_cost', 'inventory_item_id'],
  inventory_movement: ['inventory_movement_cost', 'inventory_movement_id'],
};

// Unique keys (besides tenant_id) a create can collide on (D6), and what the
// shim does when it does:
// - 'return': an idempotency key. Equal keys mean the same write (a retried
//   cobro, a re-sent batch), so the row already holding it is returned, which
//   is what Base44's "create, re-read, keep the oldest" code expects to find.
//   The open attendance (`openOnly`: `clock_out is null`) is the same: a second
//   clock-in for a person already in is the same punch, and Base44 kept the
//   oldest one too.
// - 'update': a uniqueness key whose rows are edited in place (the bar's
//   permission profile for a role, a person's PIN). Equal keys do NOT mean the
//   same payload: two first-time saves racing must not report success for the
//   one the database dropped. The losing create is applied to the existing row
//   instead (last write wins, as the handler's own update branch would do).
export const NATURAL_KEYS: Record<string, { columns: string[]; onConflict: 'return' | 'update'; openOnly?: boolean }> = {
  payment: { columns: ['idempotency_key'], onConflict: 'return' },
  cash_movement: { columns: ['idempotency_key'], onConflict: 'return' },
  inventory_movement: { columns: ['idempotency_key'], onConflict: 'return' },
  order_item: { columns: ['idempotency_key'], onConflict: 'return' },
  print_job: { columns: ['dedupe_key'], onConflict: 'return' },
  attendance: { columns: ['user_id'], onConflict: 'return', openOnly: true },
  permission_profile: { columns: ['role'], onConflict: 'update' },
  staff_pin: { columns: ['user_id'], onConflict: 'update' },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

export class ShimError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function tableOf(entity: string): string {
  const t = ENTITY_TABLE[entity];
  if (!t) throw new ShimError(500, 'unknown_entity', `entities: no table for ${entity}`);
  return t;
}

export const idColumn = (table: string) => (table === 'profile' ? 'user_id' : 'id');

function typeOf(table: string, column: string): string | undefined {
  return COLUMN_TYPES[table]?.[column];
}

// Entity field -> column, or null when the table has no such column.
function columnOf(table: string, field: string): string | null {
  if (table === 'profile') {
    if (field === 'id') return 'user_id';
    if (field === 'role') return 'is_platform';
  }
  return typeOf(table, field) ? field : null;
}

export type FilterOp =
  | { kind: 'eq'; column: string; value: unknown }
  | { kind: 'in'; column: string; values: unknown[] }
  | { kind: 'gte' | 'lt'; column: string; value: unknown }
  | { kind: 'is_null'; column: string };

export type FilterPlan = { ops: FilterOp[]; empty: boolean };

const OPERATORS = new Set(['$in', '$gte', '$lt']);

// A value as the column wants it: profile.role compares as is_platform.
function columnValue(table: string, field: string, value: unknown): unknown {
  if (table === 'profile' && field === 'role') return value === 'admin';
  return value;
}

export function planFilter(table: string, query: Record<string, unknown> = {}): FilterPlan {
  const ops: FilterOp[] = [];
  let empty = false;
  for (const [field, raw] of Object.entries(query ?? {})) {
    if (raw === undefined) continue;
    const column = columnOf(table, field);
    if (!column) throw new ShimError(500, 'unknown_field', `entities: ${table} has no column for ${field}`);
    const isUuidCol = typeOf(table, column) === 'uuid';
    if (raw === null) {
      ops.push({ kind: 'is_null', column });
      continue;
    }
    if (typeof raw === 'object' && !Array.isArray(raw)) {
      const entries = Object.entries(raw as Record<string, unknown>);
      if (entries.length === 0 || entries.some(([k]) => !OPERATORS.has(k))) {
        throw new ShimError(500, 'unsupported_filter', `entities: unsupported filter on ${table}.${field}`);
      }
      for (const [op, v] of entries) {
        if (op === '$in') {
          if (!Array.isArray(v)) throw new ShimError(500, 'unsupported_filter', `entities: $in needs a list on ${table}.${field}`);
          const values = (isUuidCol ? v.filter(isUuid) : v).map((x) => columnValue(table, field, x));
          if (values.length === 0) empty = true;
          else ops.push({ kind: 'in', column, values });
        } else {
          ops.push({ kind: op === '$gte' ? 'gte' : 'lt', column, value: v });
        }
      }
      continue;
    }
    if (Array.isArray(raw)) throw new ShimError(500, 'unsupported_filter', `entities: array value on ${table}.${field}`);
    if (isUuidCol && !isUuid(raw)) {
      empty = true;
      continue;
    }
    ops.push({ kind: 'eq', column, value: columnValue(table, field, raw) });
  }
  return { ops, empty };
}

export type SortPlan = { column: string; ascending: boolean } | null;

export function planSort(table: string, sort?: string | null): SortPlan {
  if (!sort) return null;
  const desc = sort.startsWith('-');
  const field = sort.replace(/^[-+]/, '');
  const column = columnOf(table, field);
  if (!column) throw new ShimError(500, 'unknown_field', `entities: cannot sort ${table} by ${field}`);
  return { column, ascending: !desc };
}

// PostgREST range for Base44's (limit, skip). null = no explicit window
// (PostgREST then applies the project's max rows, 1000 by default).
export function planRange(limit?: number | null, skip?: number | null): [number, number] | null {
  const from = Number.isInteger(skip) && (skip as number) > 0 ? (skip as number) : 0;
  if (Number.isInteger(limit) && (limit as number) > 0) return [from, from + (limit as number) - 1];
  if (from > 0) return [from, from + 999];
  return null;
}

export function selectFor(table: string): string {
  const cost = COST_TABLE[table];
  return cost ? `*, ${cost[0]}(unit_cost)` : '*';
}

const NON_TEXT_EMPTY_TO_NULL = new Set(['uuid', 'timestamptz', 'date', 'integer', 'bigint', 'numeric', 'boolean', 'jsonb', 'uuid[]']);

export type WritePlan = {
  row: Record<string, unknown>;
  unitCost: { present: boolean; value: unknown };
  dropped: string[];
};

// Entity data -> table row. `id` is kept on create only when it is a uuid.
export function planWrite(table: string, data: Record<string, unknown>, mode: 'create' | 'update'): WritePlan {
  const row: Record<string, unknown> = {};
  const dropped: string[] = [];
  const unitCost = { present: false, value: undefined as unknown };
  for (const [field, raw] of Object.entries(data ?? {})) {
    if (raw === undefined) continue;
    if (field === 'unit_cost' && COST_TABLE[table]) {
      unitCost.present = true;
      unitCost.value = raw === '' ? null : raw;
      continue;
    }
    const column = columnOf(table, field);
    if (!column || column === 'created_date' || column === 'updated_date') {
      dropped.push(field);
      continue;
    }
    if (column === idColumn(table)) {
      if (mode === 'create' && isUuid(raw)) row[column] = raw;
      else dropped.push(field);
      continue;
    }
    let value = columnValue(table, field, raw);
    if (value === '' && NON_TEXT_EMPTY_TO_NULL.has(typeOf(table, column) ?? '')) value = null;
    row[column] = value;
  }
  return { row, unitCost, dropped };
}

// Table row -> entity record, as the Base44 SDK returned it.
export function fromRow(table: string, row: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!row) return row;
  const out: Record<string, unknown> = { ...row };
  if (table === 'profile') {
    out.id = row.user_id;
    out.role = row.is_platform ? 'admin' : 'user';
  }
  const cost = COST_TABLE[table];
  if (cost && cost[0] in out) {
    const embedded = out[cost[0]] as unknown;
    const first = Array.isArray(embedded) ? embedded[0] : embedded;
    out.unit_cost = first && typeof first === 'object' ? ((first as Record<string, unknown>).unit_cost ?? null) : null;
    delete out[cost[0]];
  }
  return out;
}

// Postgres unique violation, as PostgREST reports it.
export const isUniqueViolation = (err: unknown) => (err as { code?: string } | null)?.code === '23505';

// The filter that finds the row holding a natural key the insert collided on.
// null when the row did not carry the whole key (then it is a real error).
export function naturalKeyFilter(table: string, row: Record<string, unknown>): Record<string, unknown> | null {
  const key = NATURAL_KEYS[table];
  if (!key || !row.tenant_id) return null;
  const q: Record<string, unknown> = { tenant_id: row.tenant_id };
  for (const c of key.columns) {
    const v = row[c];
    if (v === undefined || v === null || v === '') return null;
    q[c] = v;
  }
  if (key.openOnly) q.clock_out = null;
  return q;
}
