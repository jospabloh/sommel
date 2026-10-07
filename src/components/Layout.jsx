import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import {
  LayoutGrid, GlassWater, Users, Building2, LogOut,
  Clock, Package, BarChart3, Printer, Settings, Fingerprint, CalendarCheck,
  ShieldCheck, LifeBuoy, Info, UserCircle, Layers, Lock, ShieldAlert,
} from 'lucide-react';
import { Image } from '@/components/ui/image';
import { cn } from '@/lib/utils';
import LicenseBanner from '@/components/LicenseBanner';
import ScreenControls from '@/components/ScreenControls';
import { lockNow } from '@/lib/terminal/lockNow';
import { usePermission } from '@/lib/usePermission';
import { isPlatformUser, isBarAdmin, barRoleOf, roleLabel, personName } from '@/lib/rbac';
import AppUpdateBanner from '@/components/AppUpdateBanner';
import PrintStationProvider from '@/components/printing/PrintStationProvider';
import ApprovalProvider from '@/components/approval/ApprovalProvider';
import IdleWarningDialog from '@/components/IdleWarningDialog';
import SessionExpiredDialog from '@/components/SessionExpiredDialog';
import { useSessionManager } from '@/hooks/useSessionManager';
import { useActivityTracker } from '@/hooks/useActivityTracker';

const SOMMEL_LOGO = 'https://media.base44.com/images/public/6ab41c2a89f592a0eca074d2/068ca3173_Sommel_logo.png';

// Nav (contrato Entrega 2 §6): cada entrada se muestra según el permiso que
// abre su pantalla (mismo `can()` que el servidor), no según el rol a secas.
// Staff y Plataforma siguen siendo por rol. Sin app_role ni plataforma, no hay
// nav. Los reportes, ajustes y demás quedan fuera de la vista de quien no
// puede abrirlos (App.jsx además los protege por ruta).
const NAV_ITEMS = [
  { label: 'Plataforma', to: '/super-admin', icon: Building2, only: 'platform' },
  { label: 'Mesas', to: '/mesas', icon: LayoutGrid },
  { label: 'Menú', to: '/menu', icon: GlassWater, perm: 'Menú:ver' },
  // One entry: /estacion/todo filters Todo / Cocina / Barra itself (José,
  // 2026-10-06). /estacion/kitchen and /estacion/bar still open directly.
  { label: 'Cocina y barra', to: '/estacion/todo', icon: Layers, perm: ['Estaciones:cocina', 'Estaciones:barra'] },
  { label: 'Turno', to: '/turno', icon: Clock, perm: 'Turno:operar' },
  { label: 'Checador', to: '/checador', icon: Fingerprint, perm: 'Asistencia:checar' },
  { label: 'Asistencia', to: '/asistencia', icon: CalendarCheck, perm: 'Asistencia:checar' },
  { label: 'Inventario', to: '/inventario', icon: Package, perm: 'Inventario:ver' },
  { label: 'Reportes', to: '/reportes', icon: BarChart3, perm: 'Reportes:ver' },
  { label: 'Impresión', to: '/estacion/impresion', icon: Printer, perm: 'Impresion:operar' },
  { label: 'Staff', to: '/staff', icon: Users, only: 'bar_admin' },
  { label: 'Seguridad', to: '/seguridad', icon: ShieldAlert, perm: 'Seguridad:ver' },
  // Permisos is bar_admin/platform only; not gated with can('Ajustes:editar'),
  // which is true for bar_admin only through the role shortcut.
  { label: 'Permisos', to: '/permisos', icon: ShieldCheck, only: 'bar_admin_with_bar' },
  { label: 'Ajustes', to: '/ajustes', icon: Settings, perm: 'Ajustes:editar' },
  { label: 'Cuenta', to: '/cuenta', icon: UserCircle },
  { label: 'Soporte', to: '/soporte', icon: LifeBuoy },
  { label: 'Acerca de', to: '/about', icon: Info },
];

const TERMINAL_HIDDEN = new Set(['/cuenta', '/staff', '/permisos', '/super-admin', '/seguridad']);

function navFor(user, can) {
  const isPlatformAdmin = isPlatformUser(user);
  const appRole = barRoleOf(user);
  if (!isPlatformAdmin && !appRole) return [];
  return NAV_ITEMS.filter((it) => {
    // A terminal is shared: no one's account, team or permissions from here
    // (the server refuses them too); those need the person's own sign-in.
    if (user?.terminal && TERMINAL_HIDDEN.has(it.to)) return false;
    if (it.only === 'platform') return isPlatformAdmin;
    if (it.only === 'bar_admin_with_bar') return isBarAdmin(user) || (isPlatformAdmin && !!user?.tenant_id);
    if (it.only === 'bar_admin') return isPlatformAdmin || isBarAdmin(user);
    // An array is any-of: "Cocina y barra" shows with either station.
    if (Array.isArray(it.perm)) return it.perm.some((k) => can(k));
    return !it.perm || can(it.perm);
  });
}

// Módulo 23: the sidebar's scroll position survives a full-page reload. The
// active item is derived from the URL on every render (below), so it is right
// from the first frame; the scroll offset is not route-derived, so it lives in
// sessionStorage (per tab, gone when the tab closes).
const NAV_SCROLL_KEY = 'sommel-nav-scroll';

function readNavScroll() {
  try {
    const v = Number(sessionStorage.getItem(NAV_SCROLL_KEY));
    return Number.isFinite(v) && v > 0 ? v : 0;
  } catch {
    return 0;
  }
}

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  // Derivado del pathname en cada render (módulo 23) — nunca de un estado
  // local que podría desincronizarse de la URL real.
  const { can } = usePermission();
  const items = navFor(user, can);
  // Module 20: idle warning / forced-logout dialogs and activity tracking.
  const { idleState, sessionExpired, continueSession } = useSessionManager();
  useActivityTracker(user?.tenant_id);

  // Module 12: inside the app the theme switcher lives in its own slot in the
  // sidebar footer instead of the screen corner. Below lg every page reaches
  // the right edge, so in the corner it sat on whatever scrolled past (a table
  // card, "Reimprimir", the PIN pad's "Listo"), and no other corner is free.
  // The slot is reserved, so it covers nothing; the switcher still opens
  // sideways over the page while it is being used. Screens without this
  // layout (login, 404, the terminal lock) keep the corner.
  const switcherSlotRef = useRef(null);
  useEffect(() => {
    const slot = switcherSlotRef.current;
    if (!slot) return undefined;
    const root = document.documentElement;
    const sync = () => {
      const r = slot.getBoundingClientRect();
      root.style.setProperty('--rail-switcher-left', `${r.left}px`);
      root.style.setProperty('--rail-switcher-bottom', `${window.innerHeight - r.bottom}px`);
    };
    sync();
    root.setAttribute('data-rail-switcher', '');
    const ro = new ResizeObserver(sync);
    ro.observe(slot.parentElement || slot);
    window.addEventListener('resize', sync);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', sync);
      root.removeAttribute('data-rail-switcher');
      root.style.removeProperty('--rail-switcher-left');
      root.style.removeProperty('--rail-switcher-bottom');
    };
  }, []);

  const navRef = useRef(null);
  const savedScroll = useRef(readNavScroll());
  const appliedScroll = useRef(null);

  // Restore synchronously (before paint) once the entries exist, and again if
  // the list changes length (permissions arriving late) so the clamped value
  // is not the one that gets remembered.
  useLayoutEffect(() => {
    const el = navRef.current;
    if (!el || items.length === 0 || savedScroll.current === 0) return;
    el.scrollTop = savedScroll.current;
    appliedScroll.current = el.scrollTop;
  }, [items.length]);

  const handleNavScroll = (e) => {
    const top = e.currentTarget.scrollTop;
    if (appliedScroll.current !== null && top === appliedScroll.current) {
      appliedScroll.current = null;
      return;
    }
    savedScroll.current = top;
    try {
      sessionStorage.setItem(NAV_SCROLL_KEY, String(top));
    } catch {
      // Best-effort: without storage the nav just starts at the top.
    }
  };

  const displayName = personName(user) || 'Sesión iniciada';
  const initial = (displayName.trim().charAt(0) || '?').toUpperCase();

  const handleLogout = () => {
    logout(false);
    navigate('/login');
  };

  return (
    // The resolved theme comes from ThemeContext / index.html's pre-mount
    // script, applied to <html>; nothing here forces a mode. The theme control
    // itself is the corner ThemeSwitcher mounted in main.jsx (module 12).
    <ApprovalProvider>
    <PrintStationProvider tenantId={user?.tenant_id ?? null} allowed={can('Impresion:operar')}>
    <div className="min-h-screen bg-background text-foreground flex">
      <aside className="sticky top-0 h-screen w-20 lg:w-60 shrink-0 border-r border-border bg-sidebar flex flex-col">
        <div className="h-16 flex items-center gap-2 px-4 lg:px-6 border-b border-sidebar-border">
          <div className="w-9 h-9 rounded-lg overflow-hidden shrink-0 ring-1 ring-border">
            <Image src={SOMMEL_LOGO} alt="Sommel" className="w-full h-full" fittingType="fill" />
          </div>
          <span className="hidden lg:block font-display font-semibold text-lg tracking-tight">Sommel</span>
        </div>
        <nav ref={navRef} onScroll={handleNavScroll} className="flex-1 min-h-0 overflow-y-auto p-2 lg:p-3 space-y-1">
          {items.map((it) => {
            const Icon = it.icon;
            const active = location.pathname === it.to || (it.to !== '/' && location.pathname.startsWith(it.to));
            return (
              <Link
                key={it.to}
                to={it.to}
                title={it.label}
                aria-label={it.label}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  active ? 'bg-primary text-primary-foreground' : 'text-sidebar-foreground hover:bg-sidebar-accent'
                )}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span className="hidden lg:block">{it.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="p-2 lg:p-3 border-t border-sidebar-border space-y-1">
          {/* Reserved spot for the theme switcher (see the effect above). */}
          <div ref={switcherSlotRef} aria-hidden="true" className="h-10 w-10 mx-auto lg:mx-1" />
          {/* Who is signed in, always visible: a shared caja laptop must show
              whose session it is before anyone cobra with it. */}
          <div
            className="flex items-center gap-3 px-2 lg:px-3 py-2"
            title={`${displayName}${user?.email && user.email !== displayName ? ` (${user.email})` : ''} · ${roleLabel(user)}`}
          >
            <div className="w-9 h-9 rounded-full bg-primary/15 text-primary flex items-center justify-center text-sm font-semibold shrink-0">
              {initial}
            </div>
            <div className="hidden lg:block min-w-0">
              <p className="text-sm font-medium truncate">{displayName}</p>
              <p className="text-xs text-muted-foreground truncate">
                {roleLabel(user)}
                {user?.terminal ? ` · Terminal ${user.terminal.name}` : ''}
              </p>
            </div>
          </div>
          <ScreenControls />
          {user?.terminal ? (
            // On a terminal, signing out would undo the terminal itself: the
            // person just hands it over, and it asks "¿Quién eres?" again.
            <button
              type="button"
              onClick={lockNow}
              title="Cambiar usuario"
              aria-label="Cambiar usuario"
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
            >
              <Lock className="w-5 h-5 shrink-0" />
              <span className="hidden lg:block">Cambiar usuario</span>
            </button>
          ) : (
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
            >
              <LogOut className="w-5 h-5 shrink-0" />
              <span className="hidden lg:block">Cerrar sesión</span>
            </button>
          )}
        </div>
      </aside>
      <main className="flex-1 min-w-0 overflow-auto pb-20">
        <LicenseBanner />
        <AppUpdateBanner />
        <Outlet />
      </main>
      <IdleWarningDialog open={idleState === 'idle_warning'} onContinue={continueSession} />
      <SessionExpiredDialog open={sessionExpired} />
    </div>
    </PrintStationProvider>
    </ApprovalProvider>
  );
}
