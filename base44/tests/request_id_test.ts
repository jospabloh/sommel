import { isPlausibleRecordId } from '../functions/security/_request_id_logic.ts';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

Deno.test('a 24 hex id is plausible', () => {
  assert(isPlausibleRecordId('6a750a5d84dcc1b5f5e39eb5'), 'valid id rejected');
});

Deno.test('malformed ids are not plausible (they would 500 the backend)', () => {
  for (const bad of ['not-an-id', '', '123', '../../etc', '6a750a5d84dcc1b5f5e39eb5x', null, undefined, 42, {}]) {
    assert(!isPlausibleRecordId(bad), `accepted ${String(bad)}`);
  }
});
