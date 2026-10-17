import { isPlausibleRecordId } from '../functions/security/_request_id_logic.ts';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

Deno.test('a 24 hex id is plausible', () => {
  assert(isPlausibleRecordId('6a750a5d84dcc1b5f5e39eb5'), 'valid id rejected');
});

Deno.test('a uuid is plausible too (the same code runs on Supabase)', () => {
  assert(isPlausibleRecordId('3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c'), 'uuid rejected');
});

Deno.test('malformed ids are not plausible (they would 500 the backend)', () => {
  for (const bad of ['not-an-id', '', '123', '../../etc', '6a750a5d84dcc1b5f5e39eb5x', '3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9', '3f2b8c1e9a4d4e7b8c2a1d5e6f7a8b9c', null, undefined, 42, {}]) {
    assert(!isPlausibleRecordId(bad), `accepted ${String(bad)}`);
  }
});
