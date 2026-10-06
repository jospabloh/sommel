// Station permission checks that need Ctx (kept apart from the import-free _logic.ts).
import { hasPermission, httpError, type Ctx } from '../_guard.ts';
import { STATION_PERMISSION, permissionsForItems } from './_logic.ts';

/** Which stations this person may work. */
export async function allowedStations(ctx: Ctx): Promise<{ kitchen: boolean; bar: boolean }> {
  const [kitchen, bar] = await Promise.all([
    hasPermission(ctx, STATION_PERMISSION.kitchen),
    hasPermission(ctx, STATION_PERMISSION.bar),
  ]);
  return { kitchen, bar };
}

/** 403 unless the person may work every line's station. */
export async function requireStationsFor(ctx: Ctx, items: Array<{ station?: string | null }>): Promise<void> {
  const { keys, needsAny } = permissionsForItems(items);
  for (const key of keys) {
    if (!(await hasPermission(ctx, key))) {
      httpError(403, 'forbidden', key === STATION_PERMISSION.kitchen ? 'No tienes permiso para atender cocina' : 'No tienes permiso para atender barra');
    }
  }
  if (needsAny) {
    const allowed = await allowedStations(ctx);
    if (!allowed.kitchen && !allowed.bar) httpError(403, 'forbidden', 'No tienes permiso para esta acción');
  }
}
