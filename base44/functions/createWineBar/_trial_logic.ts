// Pure trial rules for a new bar. Zero imports so `deno test` loads it offline.
// A new bar starts in `trial` for TRIAL_DAYS; after that Mission Control's
// unified lifecycle cron owns billing_status (STANDARD module 1).
export const TRIAL_DAYS = 30;
export const TRIAL_STATUS = 'trial';
const DAY_MS = 24 * 60 * 60 * 1000;

/** ISO end of the trial, measured from `now` (ms). */
export function computeTrialEnd(now = Date.now(), days = TRIAL_DAYS): string {
  return new Date(now + days * DAY_MS).toISOString();
}

/** The exact row createWineBar writes. billing_status/trial_end_at/owner_id are
 *  platform-locked fields, so only a service role can set them. */
export function buildNewBar(input: { name: string; address: string; ownerId: string; now?: number }) {
  return {
    name: input.name,
    address: input.address,
    billing_status: TRIAL_STATUS,
    trial_end_at: computeTrialEnd(input.now),
    owner_id: input.ownerId,
  };
}
