import { DEFAULT_PAYMENT_METHODS, type PaymentMethodDef } from '../_guard.ts';

/** The bar's effective payment methods: its own list, or the default. */
export function effectiveMethods(bar: any): PaymentMethodDef[] {
  const list = bar?.payment_methods;
  return Array.isArray(list) && list.length > 0 ? list : DEFAULT_PAYMENT_METHODS;
}

/** The subset of WineBar the settings screen and payments need (contract §5). */
export function settingsView(bar: any) {
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
  };
}
