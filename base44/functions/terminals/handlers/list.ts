// terminals.list: this bar's terminals, for Ajustes > Terminales.
import { type Ctx, type Route } from '../_guard.ts';
import { publicDevice } from '../_terminal_logic.ts';
import { barPeople, requireBarAdmin } from './_shared.ts';

export const list: Route = async (ctx: Ctx) => {
  const tenantId = requireBarAdmin(ctx);
  const [rows, people] = await Promise.all([
    ctx.svc.entities.TerminalDevice.filter({ tenant_id: tenantId }, '-created_date', 100),
    barPeople(ctx, tenantId),
  ]);
  return {
    terminals: rows.map(publicDevice),
    people: people.map((p: any) => ({ id: p.id, name: p.full_name || p.email, app_role: p.app_role })),
  };
};
