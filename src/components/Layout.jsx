import React, { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import PageErrorBoundary from '@/components/PageErrorBoundary';
import { useAuth } from '@/lib/AuthContext';
import {
  LayoutGrid, GlassWater, Users, Building2,
  Clock, Package, BarChart3, Printer, Settings, Fingerprint, CalendarCheck,
  ShieldCheck, Layers, ShieldAlert,
} from 'lucide-react';
import AppShell from '@/components/AppShell';
import LicenseBanner from '@/components/LicenseBanner';
import InstallHelpDialog from '@/components/InstallHelpDialog';
import TerminalQuickActions from '@/components/TerminalQuickActions';
import { useBarSummary } from '@/lib/useBarSummary';
import { useScreenControls } from '@/lib/screen/useScreenControls';
import { lockNow } from '@/lib/terminal/lockNow';
import { usePermission } from '@/lib/usePermission';
import { isPlatformUser, isBarAdmin, barRoleOf, roleLabel, personName } from '@/lib/rbac';
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
// Cuenta and Acerca de live in the avatar menu and Soporte is the shell's
// "Enviar sugerencia" (module 29), so they are not sections here.
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
];

const TERMINAL_HIDDEN = new Set(['/staff', '/permisos', '/super-admin', '/seguridad']);

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

// The shell's collapsed preference (module 29 key). A terminal starts as the
// icon rail so the caja keeps the width for tables and the bill; once anyone
// expands or collapses it on that device, their choice wins.
const SHELL_COLLAPSED_KEY = 'acacia-shell-collapsed';

function collapseByDefaultOnTerminal(isTerminal) {
  if (!isTerminal) return;
  try {
    if (window.localStorage.getItem(SHELL_COLLAPSED_KEY) === null) {
      window.localStorage.setItem(SHELL_COLLAPSED_KEY, '1');
    }
  } catch {
    // Blocked storage: the shell starts expanded, as everywhere else.
  }
}

export default function Layout() {
  const { user, logout } = useAuth();
  // Runs during this render, before AppShell reads the key in its own state.
  useState(() => collapseByDefaultOnTerminal(!!user?.terminal));
  const barName = useBarSummary().data?.name?.trim() || '';
  const location = useLocation();
  const navigate = useNavigate();
  const { can } = usePermission();
  const items = navFor(user, can);
  // Module 20: idle warning / forced-logout dialogs and activity tracking.
  const { idleState, sessionExpired, continueSession } = useSessionManager();
  useActivityTracker(user?.tenant_id);
  const { canFullscreen, fullscreen, toggleFullscreen, install, runInstall } = useScreenControls();
  const [iosHelp, setIosHelp] = useState(false);

  const isTerminal = !!user?.terminal;
  const displayName = personName(user) || 'Sesión iniciada';
  const role = `${roleLabel(user)}${isTerminal ? ` · Terminal ${user.terminal.name}` : ''}`;

  // Avatar menu (module 29): Cuenta, Acerca de, then the screen controls. On a
  // terminal, signing out would undo the terminal itself, so "Cambiar usuario"
  // takes its place (it is also in the top bar, one tap away).
  const accountItems = [
    ...(isTerminal ? [] : [{ label: 'Cuenta', to: '/cuenta' }]),
    { label: 'Acerca de', to: '/about' },
    ...(install
      ? [{ label: 'Instalar Sommel', onSelect: () => (install === 'ios' ? setIosHelp(true) : runInstall()) }]
      : []),
    ...(canFullscreen
      ? [{ label: fullscreen ? 'Salir de pantalla completa' : 'Pantalla completa', onSelect: toggleFullscreen }]
      : []),
    ...(isTerminal ? [{ label: 'Cambiar usuario', onSelect: lockNow }] : []),
  ];

  const handleLogout = () => {
    logout(false);
    navigate('/login');
  };

  return (
    // The theme control is the corner ThemeSwitcher mounted in main.jsx
    // (module 12); the shell keeps everything it pins on the left for it.
    <ApprovalProvider>
    <PrintStationProvider tenantId={user?.tenant_id ?? null} allowed={can('Impresion:operar')}>
      <AppShell
        app={{ name: 'Sommel', logo: SOMMEL_LOGO, homeTo: '/mesas' }}
        sectionLabel="Mi bar"
        nav={items}
        feedback={{ to: '/soporte' }}
        context={
          isTerminal ? (
            <TerminalQuickActions canPunch={can('Asistencia:checar')} />
          ) : barName ? (
            <span title={barName} data-shell-bar-name>{barName}</span>
          ) : null
        }
        user={{ name: displayName, email: user?.email, role, context: barName || undefined }}
        accountItems={accountItems}
        onSignOut={isTerminal ? undefined : handleLogout}
      >
        {/* The shell pads its <main>; Sommel's pages carry their own padding
            (and pb-24 under Orden's bar), so this undoes the shell's instead
            of re-tuning every page. pb-20 lets the end of any page scroll
            clear of the corner theme control (module 12). */}
        <div className="-mx-4 -my-6 md:-mx-8 pb-20">
          <LicenseBanner />
          <PageErrorBoundary key={location.pathname}>
            <Outlet />
          </PageErrorBoundary>
        </div>
      </AppShell>
      <IdleWarningDialog open={idleState === 'idle_warning'} onContinue={continueSession} />
      <SessionExpiredDialog open={sessionExpired} />
      <InstallHelpDialog open={iosHelp} onOpenChange={setIosHelp} />
    </PrintStationProvider>
    </ApprovalProvider>
  );
}
