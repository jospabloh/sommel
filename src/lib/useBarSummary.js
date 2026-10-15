// The bar as settings.billing returns it (name, license state, trial end).
// One query shared by every reader: LicenseBanner and the sidebar both call this
// hook with the same key, so React Query fetches it once per tenant.
//
// The client cannot read WineBar directly (its entity RLS never matches a flat
// row, verified live), so the bar comes through settings.billing, which needs
// membership only (no permission key), so restricted staff can read it too.
// Any failure resolves to null: callers render nothing rather than an error.
import { useQuery } from '@tanstack/react-query';
import { callFn } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';

export const barSummaryKey = (tenantId) => ['license-banner', tenantId];

async function fetchBar() {
  try {
    const res = await callFn('settings', 'billing');
    return res?.bar ?? null;
  } catch {
    return null;
  }
}

export function useBarSummary() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id ?? null;
  return useQuery({
    queryKey: barSummaryKey(tenantId),
    queryFn: fetchBar,
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    retry: false,
  });
}
