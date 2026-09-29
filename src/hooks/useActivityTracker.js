import { useEffect } from 'react';
import { base44 } from '@/api/base44Client';

/**
 * useActivityTracker — Silently updates last_active_at on the server.
 * Throttle is global (module-level) so re-renders/re-mounts never bypass it.
 *
 * This is a separate, lower-frequency signal from useSessionManager's
 * heartbeat: the heartbeat proves "this tab is still open," this proves
 * "a real person did something" — used for usage/engagement reporting
 * (Mission Control's `usage` table), not for the idle timer itself.
 */

const THROTTLE_MS = 60 * 60 * 1000; // 60 minutes — global across all renders
let lastSentGlobal = 0;
let pendingTimer = null;

async function sendActivity() {
  const now = Date.now();
  if (now - lastSentGlobal < THROTTLE_MS) return;
  lastSentGlobal = now;
  try {
    await base44.functions.invoke('session', { action: 'trackActivity' });
  } catch {
    // Silently ignore
  }
}

// tenantId: the app's own tenant-scoping id (family_id, business_id, ...) —
// pass whatever this app already resolves post-auth; the hook only uses it
// as a "don't fire before we actually know who this is" gate.
export function useActivityTracker(tenantId) {
  useEffect(() => {
    if (!tenantId) return;

    // Delay on mount so the page's primary queries go first.
    if (!pendingTimer) {
      pendingTimer = setTimeout(() => {
        pendingTimer = null;
        sendActivity();
      }, 5000);
    }

    // Fire on visibility change (user returns to tab)
    const onVisible = () => {
      if (document.visibilityState === 'visible') sendActivity();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [tenantId]);
}
