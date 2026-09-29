import { useEffect, useRef, useState, useCallback } from 'react';
import { base44 } from '@/api/base44Client';

/**
 * ACACIA portfolio session control — Module 20 of STANDARD.md.
 *
 * Three layers in one hook: idle detection (warn, then log out), a
 * heartbeat that keeps this device's Session row alive, and a device
 * identity so the backend can tell "this device" from "another device
 * the same user is also logged in on."
 *
 * Keep the thresholds identical across the portfolio unless an app has a
 * documented reason to differ (in its own CLAUDE.md, not silently here) —
 * an operator running two ACACIA apps should meet the same idle warning at
 * the same point in both.
 */

const IDLE_WARNING_MS = 20 * 60 * 1000;   // 20 min → show warning
const IDLE_LOGOUT_MS  =  2 * 60 * 1000;   // 2 min after warning → logout
const HEARTBEAT_INTERVAL_MS = 4 * 60 * 1000; // heartbeat every 4 min
const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click', 'wheel'];
const DEVICE_ID_KEY = 'acacia_device_id';

function getOrCreateDeviceId() {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

function getDeviceName() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Mac/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows';
  return 'Navegador';
}

export function useSessionManager() {
  const [sessionId, setSessionId] = useState(null);
  const [sessionStatus, setSessionStatus] = useState('active'); // 'active' | 'passive'
  const [idleState, setIdleState] = useState(null);             // null | 'idle_warning'
  const [sessionExpired, setSessionExpired] = useState(false);

  const lastActivityRef = useRef(Date.now());
  const idleTimerRef = useRef(null);
  const logoutTimerRef = useRef(null);
  const heartbeatRef = useRef(null);
  const sessionIdRef = useRef(null);

  // ── Initialize session ──────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const device_id = getOrCreateDeviceId();
    const device_name = getDeviceName();

    base44.functions.invoke('session', { action: 'manageSession', device_id, device_name })
      .then(res => {
        if (cancelled) return;
        const session = res?.data?.session;
        if (session) {
          sessionIdRef.current = session.id;
          setSessionId(session.id);
          setSessionStatus(session.status);
        }
      })
      .catch(err => {
        if (err?.response?.status === 403) setSessionExpired(true);
      });

    return () => { cancelled = true; };
  }, []);

  // ── Heartbeat ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sessionId) return;

    const sendHeartbeat = async () => {
      if (idleState === 'idle_warning' || sessionExpired) return;
      try {
        const res = await base44.functions.invoke('session', { action: 'sessionHeartbeat', session_id: sessionId });
        const status = res?.data?.status;
        if (status) setSessionStatus(status);
        // A status of 'revoked' means Layer 3 (the stale-session reap job,
        // or an admin's remote force-logout) closed this session server-side
        // since the last heartbeat — treat it exactly like an idle timeout.
        if (status === 'revoked') setSessionExpired(true);
      } catch (err) {
        if (err?.response?.status === 403) setSessionExpired(true);
      }
    };

    heartbeatRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(heartbeatRef.current);
  }, [sessionId, idleState, sessionExpired]);

  // ── Idle detection ──────────────────────────────────────────────────────
  const resetIdleTimers = useCallback(() => {
    lastActivityRef.current = Date.now();
    clearTimeout(idleTimerRef.current);
    clearTimeout(logoutTimerRef.current);
    setIdleState(null);

    idleTimerRef.current = setTimeout(() => {
      setIdleState('idle_warning');
      logoutTimerRef.current = setTimeout(() => {
        setSessionExpired(true);
        setIdleState(null);
      }, IDLE_LOGOUT_MS);
    }, IDLE_WARNING_MS);
  }, []);

  useEffect(() => {
    const onActivity = () => resetIdleTimers();
    ACTIVITY_EVENTS.forEach(e => globalThis.addEventListener(e, onActivity, { passive: true }));
    resetIdleTimers(); // start timers immediately

    return () => {
      ACTIVITY_EVENTS.forEach(e => globalThis.removeEventListener(e, onActivity));
      clearTimeout(idleTimerRef.current);
      clearTimeout(logoutTimerRef.current);
    };
  }, [resetIdleTimers]);

  // ── Actions ─────────────────────────────────────────────────────────────
  const continueSession = useCallback(() => {
    clearTimeout(logoutTimerRef.current);
    resetIdleTimers();
  }, [resetIdleTimers]);

  const reactivate = useCallback(async () => {
    if (!sessionIdRef.current) return;
    try {
      const device_id = getOrCreateDeviceId();
      const device_name = getDeviceName();
      const res = await base44.functions.invoke('session', { action: 'manageSession', device_id, device_name });
      const session = res?.data?.session;
      if (session) {
        setSessionStatus(session.status);
        sessionIdRef.current = session.id;
      }
    } catch {
      // Ignore reactivation failures and keep current local session state.
    }
  }, []);

  return { sessionStatus, idleState, sessionExpired, continueSession, reactivate };
}
