import React from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { Wine, ShoppingCart, GlassWater, LayoutGrid, Users, Building2, LogOut } from 'lucide-react';
import { Image } from '@/components/ui/image';
import { cn } from '@/lib/utils';

const SOMMEL_LOGO = 'https://media.base44.com/images/public/6ab41c2a89f592a0eca074d2/068ca3173_Sommel_logo.png';

const navFor = (user) => {
  const isPlatformAdmin = user?.role === 'admin';
  const appRole = user?.data?.app_role;
  if (isPlatformAdmin) {
    return [
      { label: 'Plataforma', to: '/super-admin', icon: Building2 },
      { label: 'POS', to: '/pos', icon: ShoppingCart },
      { label: 'Productos', to: '/products', icon: GlassWater },
      { label: 'Mesas', to: '/tables', icon: LayoutGrid },
    ];
  }
  if (appRole === 'bar_admin') {
    return [
      { label: 'Resumen', to: '/', icon: Wine },
      { label: 'POS', to: '/pos', icon: ShoppingCart },
      { label: 'Productos', to: '/products', icon: GlassWater },
      { label: 'Mesas', to: '/tables', icon: LayoutGrid },
      { label: 'Staff', to: '/staff', icon: Users },
    ];
  }
  return [
    { label: 'POS', to: '/pos', icon: ShoppingCart },
  ];
};

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const items = navFor(user);

  const handleLogout = () => {
    logout(false);
    navigate('/login');
  };

  return (
    <div className="dark min-h-screen bg-background text-foreground flex">
      <aside className="w-20 lg:w-60 shrink-0 border-r border-border bg-sidebar flex flex-col">
        <div className="h-16 flex items-center gap-2 px-4 lg:px-6 border-b border-sidebar-border">
          <div className="w-9 h-9 rounded-lg overflow-hidden shrink-0 ring-1 ring-border">
            <Image src={SOMMEL_LOGO} alt="Sommel" className="w-full h-full" fittingType="fill" />
          </div>
          <span className="hidden lg:block font-display font-semibold text-lg tracking-tight">Sommel</span>
        </div>
        <nav className="flex-1 p-2 lg:p-3 space-y-1">
          {items.map((it) => {
            const Icon = it.icon;
            const active = location.pathname === it.to || (it.to !== '/' && location.pathname.startsWith(it.to));
            return (
              <Link
                key={it.to}
                to={it.to}
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
        <div className="p-2 lg:p-3 border-t border-sidebar-border">
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