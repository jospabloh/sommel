// In-memory stand-in for the part of supabase-js the `entities` shim uses, so
// the generated Edge Functions run end to end in `deno test` with no network.
// It is NOT Postgres: no RLS, no types, no foreign keys. It does enforce the
// unique keys the shim relies on (D6), returning Postgres' 23505 like PostgREST.
// The real database is exercised by supabase/tests/isolation.sql (CI).
import { COST_TABLE, NATURAL_KEYS } from '../../functions/_shared/entities_logic.ts';
import type { AdminClient } from '../../functions/_shared/compat.ts';

type Row = Record<string, unknown>;
type Result = { data: unknown; error: unknown };

const UNIQUE_EXTRA: Record<string, string[][]> = { passkey: [['credential_id']] };

export class FakeDb {
  tables = new Map<string, Row[]>();
  tokens = new Map<string, { id: string; email: string }>();
  deletedUsers: string[] = [];
  ops = 0;
  private clock = Date.parse('2026-10-16T12:00:00Z');

  rows(table: string): Row[] {
    if (!this.tables.has(table)) this.tables.set(table, []);
    return this.tables.get(table)!;
  }

  now(): string {
    this.clock += 1000;
    return new Date(this.clock).toISOString();
  }

  seed(table: string, row: Row): Row {
    const full: Row = { id: crypto.randomUUID(), created_date: this.now(), updated_date: this.now(), ...row };
    if (table === 'profile') delete full.id;
    this.rows(table).push(full);
    return full;
  }

  signIn(userId: string, email: string): string {
    const token = `tok-${userId}`;
    this.tokens.set(token, { id: userId, email });
    return token;
  }

  violates(table: string, row: Row, ignore?: Row): boolean {
    const keys: string[][] = [...(UNIQUE_EXTRA[table] ?? [])];
    const nk = NATURAL_KEYS[table];
    if (nk) keys.push(['tenant_id', ...nk.columns]);
    return keys.some((cols) => {
      if (cols.some((c) => row[c] === undefined || row[c] === null || row[c] === '')) return false;
      if (nk?.openOnly && cols.length > 1 && row.clock_out) return false;
      return this.rows(table).some(
        (r) => r !== ignore && cols.every((c) => r[c] === row[c]) && !(nk?.openOnly && cols.length > 1 && r.clock_out),
      );
    });
  }

  client(): AdminClient {
    // deno-lint-ignore no-this-alias
    const db = this;
    return {
      from: (table: string) => new Query(db, table),
      auth: {
        getUser: (jwt: string) => {
          const u = db.tokens.get(jwt);
          return Promise.resolve(u ? { data: { user: { id: u.id, email: u.email } }, error: null } : { data: { user: null }, error: { message: 'bad jwt' } });
        },
        admin: {
          deleteUser: (id: string) => {
            db.deletedUsers.push(id);
            db.tables.set('profile', db.rows('profile').filter((r) => r.user_id !== id));
            return Promise.resolve({ error: null });
          },
        },
      },
    };
  }

  insert(table: string, row: Row): Result {
    const key = table === 'profile' ? 'user_id' : 'id';
    const full: Row = { created_date: this.now(), updated_date: this.now(), ...row };
    if (!(key in full) && !table.endsWith('_cost')) full[key] = crypto.randomUUID();
    if (this.violates(table, full)) return { data: null, error: { code: '23505', message: 'duplicate key value' } };
    this.rows(table).push(full);
    return { data: full, error: null };
  }
}

class Query {
  private filters: ((r: Row) => boolean)[] = [];
  private orderBy: { column: string; ascending: boolean } | null = null;
  private window: [number, number] | null = null;
  private mode: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
  private payload: Row | null = null;
  private onConflict = '';
  private one: 'single' | 'maybe' | null = null;
  private embed: string | null = null;

  constructor(private db: FakeDb, private table: string) {}

  select(str = '*') {
    const m = str.match(/,\s*(\w+)\(unit_cost\)/);
    this.embed = m ? m[1] : null;
    return this;
  }
  eq(c: string, v: unknown) {
    this.filters.push((r) => r[c] === v);
    return this;
  }
  in(c: string, vs: unknown[]) {
    this.filters.push((r) => vs.includes(r[c]));
    return this;
  }
  gte(c: string, v: unknown) {
    this.filters.push((r) => r[c] != null && String(r[c]) >= String(v));
    return this;
  }
  lt(c: string, v: unknown) {
    this.filters.push((r) => r[c] != null && String(r[c]) < String(v));
    return this;
  }
  is(c: string, _v: null) {
    this.filters.push((r) => r[c] === null || r[c] === undefined);
    return this;
  }
  order(column: string, opts: { ascending: boolean }) {
    this.orderBy = { column, ascending: opts.ascending };
    return this;
  }
  range(from: number, to: number) {
    this.window = [from, to];
    return this;
  }
  insert(row: Row) {
    this.mode = 'insert';
    this.payload = row;
    return this;
  }
  update(patch: Row) {
    this.mode = 'update';
    this.payload = patch;
    return this;
  }
  upsert(row: Row, opts: { onConflict: string }) {
    this.mode = 'upsert';
    this.payload = row;
    this.onConflict = opts.onConflict;
    return this;
  }
  delete() {
    this.mode = 'delete';
    return this;
  }
  single() {
    this.one = 'single';
    return this;
  }
  maybeSingle() {
    this.one = 'maybe';
    return this;
  }

  private withCost(r: Row): Row {
    if (!this.embed) return { ...r };
    const fk = COST_TABLE[this.table][1];
    const cost = this.db.rows(this.embed).filter((c) => c[fk] === r.id).map((c) => ({ unit_cost: c.unit_cost }));
    return { ...r, [this.embed]: cost };
  }

  private shape(rows: Row[]): Result {
    const out = rows.map((r) => this.withCost(r));
    if (!this.one) return { data: out, error: null };
    if (out.length > 1) return { data: null, error: { code: 'PGRST116', message: 'more than one row' } };
    if (out.length === 0 && this.one === 'single') return { data: null, error: { code: 'PGRST116', message: 'no rows' } };
    return { data: out[0] ?? null, error: null };
  }

  private run(): Result {
    this.db.ops++;
    const all = this.db.rows(this.table);
    const match = all.filter((r) => this.filters.every((f) => f(r)));
    if (this.mode === 'insert') {
      const res = this.db.insert(this.table, this.payload!);
      return res.error ? res : this.shape([res.data as Row]);
    }
    if (this.mode === 'upsert') {
      const existing = all.find((r) => r[this.onConflict] === this.payload![this.onConflict]);
      if (existing) Object.assign(existing, this.payload, { updated_date: this.db.now() });
      else this.db.insert(this.table, this.payload!);
      return { data: null, error: null };
    }
    if (this.mode === 'update') {
      for (const r of match) {
        const next = { ...r, ...this.payload };
        if (this.db.violates(this.table, next, r)) return { data: null, error: { code: '23505', message: 'duplicate key value' } };
      }
      for (const r of match) Object.assign(r, this.payload, { updated_date: this.db.now() });
      return this.shape(match);
    }
    if (this.mode === 'delete') {
      this.db.tables.set(this.table, all.filter((r) => !match.includes(r)));
      return { data: null, error: null };
    }
    let rows = match;
    if (this.orderBy) {
      const { column, ascending } = this.orderBy;
      rows = [...rows].sort((a, b) => (String(a[column] ?? '') < String(b[column] ?? '') ? -1 : 1) * (ascending ? 1 : -1));
    }
    if (this.window) rows = rows.slice(this.window[0], this.window[1] + 1);
    return this.shape(rows);
  }

  then(resolve: (r: Result) => unknown, reject?: (e: unknown) => unknown) {
    try {
      return Promise.resolve(resolve(this.run()));
    } catch (e) {
      return reject ? Promise.resolve(reject(e)) : Promise.reject(e);
    }
  }
}
