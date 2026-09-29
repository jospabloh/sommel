// Module 19: the security locks and their rationale must stay in the entity
// files. Uses the same manifest as `npm run validate:locks`.
//   deno test --allow-env --allow-read=base44/entities base44/tests/locks_test.ts
// (CI's deno step must pass --allow-read=base44/entities; this is the only test that reads files.)
// @ts-ignore: plain JS module shared with the Node CLI, no external imports.
import { collectLockErrors, loadSchemas, FIELD_LOCKS, ENTITY_LOCKS } from '../../scripts/lib/locks-rules.mjs';

const DIR = new URL('../entities', import.meta.url).pathname;

function fresh(): Record<string, any> {
  try {
    return loadSchemas(DIR);
  } catch (err) {
    if (err instanceof Deno.errors.PermissionDenied) {
      throw new Error('locks_test needs read access to base44/entities: run deno test --allow-env --allow-read=base44/entities base44/tests/');
    }
    throw err;
  }
}
function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}
function errorsOf(mutate: (s: Record<string, any>) => void): string[] {
  const s = fresh();
  mutate(s);
  return collectLockErrors(s).errors;
}

Deno.test('locks: repo entity files satisfy the manifest', () => {
  const { errors, checked } = collectLockErrors(fresh());
  assert(errors.length === 0, errors.join('\n'));
  assert(checked === FIELD_LOCKS.length + ENTITY_LOCKS.length, 'checked count mismatch');
});

Deno.test('locks: removing a field lock fails', () => {
  const e = errorsOf((s) => { delete s.WineBar.properties.billing_status.rls; });
  assert(e.some((x: string) => x.startsWith('WineBar.billing_status')), e.join('\n'));
  const e2 = errorsOf((s) => { delete s.OrderItem.properties.unit_cost.rls; });
  assert(e2.some((x: string) => x.startsWith('OrderItem.unit_cost')), e2.join('\n'));
});

Deno.test('locks: User pointer lock flipped to writable fails', () => {
  const e = errorsOf((s) => { s.User.properties.tenant_id.rls.write = true; });
  assert(e.some((x: string) => x.startsWith('User.tenant_id')), e.join('\n'));
});

Deno.test('locks: loosening Product.read fails', () => {
  const e = errorsOf((s) => {
    s.Product.rls.read = { $or: [{ 'data.tenant_id': '{{user.data.tenant_id}}' }, { user_condition: { role: 'admin' } }] };
  });
  assert(e.some((x: string) => x.startsWith('Product [read]')), e.join('\n'));
});

Deno.test('locks: loosening an admin-only write fails', () => {
  const e = errorsOf((s) => { s.Payment.rls.update = { 'data.tenant_id': '{{user.data.tenant_id}}' }; });
  assert(e.some((x: string) => x.startsWith('Payment [update]')), e.join('\n'));
});

Deno.test('locks: deleting a rationale or shortening it fails', () => {
  const e = errorsOf((s) => { s.Attendance.properties.tenant_id.description = 'WineBar dueño de esta marca'; });
  assert(e.some((x: string) => x.startsWith('Attendance.tenant_id')), e.join('\n'));
  const e2 = errorsOf((s) => {
    s.WineBar.properties.owner_id.description = s.WineBar.properties.owner_id.description.replace('Módulo 19', 'Modulo X');
  });
  assert(e2.some((x: string) => x.includes('Módulo 19')), e2.join('\n'));
});

Deno.test('locks: a description that omits the governed operation fails', () => {
  const e = errorsOf((s) => {
    s.InventoryItem.properties.unit_cost.description =
      s.InventoryItem.properties.unit_cost.description.replace(/lectura/gi, 'acceso');
  });
  assert(e.some((x: string) => x.includes('"lectura"')), e.join('\n'));
});

Deno.test('locks: a missing entity or field is reported, not skipped', () => {
  const e = errorsOf((s) => { delete s.StaffPin; delete s.WineBar.properties.plan; });
  assert(e.some((x: string) => x.startsWith('StaffPin')), e.join('\n'));
  assert(e.some((x: string) => x.startsWith('WineBar.plan')), e.join('\n'));
});
