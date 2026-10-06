import { DEFAULT_PAYMENT_METHODS, type PaymentMethodDef } from '../_guard.ts';

/** The bar's effective payment methods: its own list, or the default. */
export function effectiveMethods(bar: any): PaymentMethodDef[] {
  const list = bar?.payment_methods;
  return Array.isArray(list) && list.length > 0 ? list : DEFAULT_PAYMENT_METHODS;
}

/** The subset of WineBar the settings screen and payments need (contract §5). */
export function settingsView(bar: any, viewerId?: string | null) {
  return {
    name: bar?.name ?? '',
    address: bar?.address ?? '',
    rfc: bar?.rfc ?? '',
    ticket_header: bar?.ticket_header ?? '',
    ticket_footer: bar?.ticket_footer ?? '',
    payment_methods: effectiveMethods(bar),
    corte_emails: Array.isArray(bar?.corte_emails) ? bar.corte_emails : [],
    prep_goal_kitchen_min: bar?.prep_goal_kitchen_min ?? null,
    prep_goal_bar_min: bar?.prep_goal_bar_min ?? null,
    approval_qr_enabled: bar?.approval_qr_enabled === true,
    // Read-only license fields for the billing banner (Layout.jsx). Not in
    // EDITABLE_FIELDS: settings.update can never write them.
    billing_status: bar?.billing_status ?? null,
    trial_end_at: bar?.trial_end_at ?? null,
    // Module 7 (LicenseCard): plan and paid-until date, read-only for the same
    // reason. `is_owner` lets the danger zone show owner-only actions; the
    // server re-checks ownership on every account action regardless.
    plan: bar?.plan ?? null,
    current_period_end: bar?.current_period_end ?? null,
    is_owner: !!viewerId && !!bar?.owner_id && bar.owner_id === viewerId,
  };
}
