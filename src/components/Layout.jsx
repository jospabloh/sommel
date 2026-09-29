import React from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import {
  LayoutGrid, GlassWater, ChefHat, Beer, Users, Building2, LogOut, Sun, Moon, Monitor,
  Clock, Package, BarChart3, Printer, Settings, Fingerprint, CalendarCheck,
} from 'lucide-react';
import { Image } from '@/components/ui/image';
import { cn } from '@/lib/utils';
import { useTheme } from '@/lib/useTheme';
import { usePermission } from '@/lib/usePermission';

// Módulo 12 (fixed 2026-09-28): Sun / Moon / Monitor, cycling light -> dark ->
// system -> light. Existing tokens only, no new fixed colors.
const THEME_CYCLE = { light: 'dark', dark: 'system', system: 'light' };
const THEME_ICON = { light: Sun, dark: Moon, system: Monitor };
const THEME_LABEL = { light: 'Claro', dark: 'Oscuro', system: 'Sistema' };

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
  { label: 'Cocina', to: '/estacion/kitchen', icon: ChefHat, perm: 'Estaciones:operar' },
  { label: 'Barra', to: '/estacion/bar', icon: Beer, perm: 'Estaciones:operar' },
  { label: 'Turno', to: '/turno', icon: Clock, perm: 'Turno:operar' },
  { label: 'Checador', to: '/checador', icon: Fingerprint, perm: 'Asistencia:checar' },
  { label: 'Asistencia', to: '/asistencia', icon: CalendarCheck, perm: 'Asistencia:checar' },
  { label: 'Inventario', to: '/inventario', icon: Package, perm: 'Inventario:ver' },
  { label: 'Reportes', to: '/reportes', icon: BarChart3, perm: 'Reportes:ver' },
  { label: 'Impresión', to: '/estacion/impresion', icon: Printer, perm: 'Impresion:operar' },
  { label: 'Staff', to: '/staff', icon: Users, only: 'bar_admin' },
  { label: 'Ajustes', to: '/ajustes', icon: Settings, perm: 'Ajustes:editar' },
];

function navFor(user, can) {
  const isPlatformAdmin = user?.role === 'admin';
  const appRole = user?.app_role;
  if (!isPlatformAdmin && !appRole) return [];
  return NAV_ITEMS.filter((it) => {
    if (it.only === 'platform') return isPlatformAdmin;
    if (it.only === 'bar_admin') return isPlatformAdmin || appRole === 'bar_admin';
    return !it.perm || can(it.perm);
  });
}

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { preference, setPreference } = useTheme();
  // Derivado del pathname en cada render (módulo 23) — nunca de un estado
  // local que podría desincronizarse de la URL real.
  const { can } = usePermission();
  const items = navFor(user, can);

  const handleLogout = () => {
    logout(false);
    navigate('/login');
  };

  const ThemeIcon = THEME_ICON[preference];

  return (
    // Fixed 2026-09-28: this div used to hardcode `dark`, forcing every
    // screen dark regardless of device or the person's own choice — the
    // resolved theme now comes from useTheme()/index.html's pre-mount
    // script, applied to <html>, not forced here.
    <div className="min-h-screen bg-background text-foreground flex">
      <aside className="w-20 lg:w-60 shrink-0 border-r border-border bg-sidebar flex flex-col">
        <div className="h-16 flex items-center gap-2 px-4 lg:px-6 border-b border-sidebar-border">
          <div className="w-9 h-9 rounded-lg overflow-hidden shrink-0 ring-1 ring-border">
            <Image src={SOMMEL_LOGO} alt="Sommel" className="w-full h-full" fittingType="fill" />
          </div>
          <span className="hidden lg:block font-display font-semibold text-lg tracking-tight">Sommel</span>
        </div>
        <nav className="flex-1 min-h-0 overflow-y-auto p-2 lg:p-3 space-y-1">
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
          <button
            type="button"
            onClick={() => setPreference(THEME_CYCLE[preference])}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
            aria-label={`Tema: ${THEME_LABEL[preference]}. Toca para cambiar.`}
          >
            <ThemeIcon className="w-5 h-5 shrink-0" />
            <span className="hidden lg:block">Tema: {THEME_LABEL[preference]}</span>
          </button>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
          >
            <LogOut className="w-5 h-5 shrink-0" />
            <span className="hidden lg:block">Cerrar sesión</span>
          </button>
        </div>
      </aside>
      <main className="flex-1 min-w-0 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
