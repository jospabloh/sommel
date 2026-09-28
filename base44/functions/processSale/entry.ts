// processSale — RETIRED 2026-09-28 (finding, entrega-1-contratos.md review).
//
// This was the original prototype's one-shot "charge the whole order now"
// endpoint (plan-tecnico.md §0: "processSale crea la orden ya pagada").
// Entrega 1 replaces that flow with `orders` (open/addItems/send/...); a
// `payments` endpoint that actually closes/charges an order is Entrega 2
// (plan-tecnico.md §6). Until payments exists, `orders`+`payments` don't yet
// "cover" what this endpoint did (plan §3's stated precondition for deleting
// it outright — `npm run functions:audit` first), so the file stays and the
// slot in `maxFunctions` stays reserved, but every call is rejected instead
// of running.
//
// Why this couldn't just wait for Entrega 2: audited 2026-09-28 and it was a
// live, deployable security gap, not dormant dead code —
//   - no permission check (any authenticated user with a tenant_id could
//     call it) and no `requireWritable`/billing_status gate (a suspended or
//     view_only bar could still "sell" through it);
//   - `tenant_id` came from `user.data.tenant_id` (module 22: never trust
//     auth.me()'s own .data, always re-read `User` with asServiceRole —
//     every other handler in this repo does; this one never did);
//   - it wrote `Order.status: 'paid'` and `Order.items: [...]`, a shape that
//     predates this app's redesign (D5: OrderItem is its own entity now;
//     Order.status is `abierta | cobrada | cancelada`, no `'paid'`) — so a
//     successful call would have written a row nothing else in this app
//     could read correctly.
// `grep -rn processSale src/` confirms nothing in the client calls this —
// it was already orphaned, so rejecting every call breaks no UI.
export default async function (_req: Request): Promise<Response> {
  return Response.json(
    {
      error:
        'Este endpoint fue retirado. Usa orders.open + orders.addItems + orders.send; el cobro llega con payments en la Entrega 2.',
      code: 'retired',
    },
    { status: 410 }
  );
}
