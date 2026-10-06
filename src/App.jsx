import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate, Outlet, useLocation } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { PermissionProvider } from '@/lib/PermissionContext';
import { usePermission } from '@/lib/usePermission';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import { isAuthPath, loginPath } from '@/lib/loginPath';
import { isPlatformUser, canManageBar } from '@/lib/rbac';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';
import Layout from '@/components/Layout';
import TerminalGate from '@/components/terminal/TerminalGate';
import Menu from '@/pages/Menu';
import Mesas from '@/pages/Mesas';
import Orden from '@/pages/Orden';
import Estacion from '@/pages/Estacion';
import SuperAdmin from '@/pages/SuperAdmin';
import Staff from '@/pages/Staff';
import Turno from '@/pages/Turno';
import Checador from '@/pages/Checador';
import Asistencia from '@/pages/Asistencia';
import Inventario from '@/pages/Inventario';
import Reportes from '@/pages/Reportes';
import Ajustes from '@/pages/Ajustes';
import Permisos from '@/pages/Permisos';
import Cuenta from '@/pages/Cuenta';
import Soporte from '@/pages/Soporte';
import About from '@/pages/About';
import Impresion from '@/pages/Impresion';
import Onboarding from '@/pages/Onboarding';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
// Add page imports here

// Fixed 2026-09-28 (D "onboarding not routed"): a logged-in user who isn't
// the platform admin and has no `tenant_id` yet has nowhere real to land —
// every protected screen assumes a bar. Gates the Layout-wrapped routes:
// redirects to /onboarding instead of rendering a broken/empty screen.
// `user.role`/`user.tenant_id` are flat (contract §1's "Forma de los
// registros").
const RequireTenant = () => {
  const { user } = useAuth();
  if (user && !isPlatformUser(user) && !user.tenant_id) {
    return <Navigate to="/onboarding" replace />;
  }
  return <Outlet />;
};

// The inverse: once the user has a bar (or is the platform admin, who never
// needs one), /onboarding itself redirects to /mesas instead of showing the
// "create your bar" form again.
const OnboardingRoute = () => {
  const { user } = useAuth();
  if (user && (isPlatformUser(user) || user.tenant_id)) {
    return <Navigate to="/mesas" replace />;
  }
  return <Onboarding />;
};

// Entrega 2 (contrato §6): a screen only its permission holders can open.
// Waits for the PermissionProfile to load so a staff member whose admin
// granted the key is not bounced before the override arrives.
const RequirePermission = ({ perm }) => {
  const { can, loading } = usePermission();
  if (loading) {
    return (
      <div className="flex justify-center py-16" role="status" aria-label="Cargando">
        <div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin" />
      </div>
    );
  }
  if (!can(perm)) return <Navigate to="/mesas" replace />;
  return <Outlet />;
};

// Module 10: an unauthenticated visitor lands on Sommel's own /login, keeping
// where they were going in ?returnTo=. Rendered inside the router so it can
// read the location; never used on an auth route itself (no loop).
// Screens only the bar administrator (or the platform) can open. The screen
// guards itself too; this keeps the URL from rendering for anyone else.
const RequireBarAdmin = () => {
  const { user } = useAuth();
  // The platform account only manages a bar it actually belongs to.
  if (!canManageBar(user) || (isPlatformUser(user) && !user.tenant_id)) return <Navigate to="/mesas" replace />;
  return <Outlet />;
};

const RedirectToLogin = () => {
  const location = useLocation();
  return <Navigate to={loginPath(location)} replace />;
};

const AuthLoading = () => (
  <div className="fixed inset-0 flex items-center justify-center bg-background" role="status" aria-label="Cargando">
    <div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin"></div>
  </div>
);

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError } = useAuth();
  const location = useLocation();

  // The auth screens do not depend on any session state, so they render before
  // the loading spinner and before the authError early returns below. Without
  // that, an expired token (authError auth_required) would bounce /login
  // itself back to /login forever, and a slow public-settings call would hide
  // the form.
  if (isAuthPath(location.pathname)) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
      </Routes>
    );
  }

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return <AuthLoading />;
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      return <RedirectToLogin />;
    }
  }

  // Render the main app. Entrega 1 (docs/entrega-1-contratos.md §5): las
  // rutas del prototipo (/pos, /products, /tables) se eliminan con sus
  // páginas — '/' redirige a /mesas, que es donde arranca el flujo real
  // (mapa de mesas → comanda → envío a cocina/barra).
  return (
    <Routes>
      <Route element={<ProtectedRoute unauthenticatedElement={<RedirectToLogin />} />}>
        <Route path="/onboarding" element={<OnboardingRoute />} />
        <Route element={<RequireTenant />}>
          {/* Terminal mode: a terminal shows "¿Quién eres?" until a PIN unlocks it. */}
          <Route element={<TerminalGate />}>
          <Route element={<Layout />}>
            <Route path="/" element={<Navigate to="/mesas" replace />} />
            <Route path="/menu" element={<Menu />} />
            <Route path="/mesas" element={<Mesas />} />
            {/* Fixed 2026-09-28: a separate static "/orden/nueva" route used
               to sit alongside this one. React Router ranks a static segment
               above a dynamic one regardless of declaration order, so
               "/orden/nueva" matched THAT route instead, useParams().orderId
               came back undefined (no :orderId here), Orden.jsx's `isNew`
               check (`orderId === 'nueva'`) was always false, and the "para
               llevar" screen never rendered — just an infinite spinner. Orden.jsx
               and useOrderRealtime.js were already written to treat
               orderId === 'nueva' as the "new order" case; this single route
               is what actually delivers that value. */}
            <Route path="/orden/:orderId" element={<Orden />} />
            {/* /estacion/impresion is the print station (Entrega 2), not a
               kitchen/bar station: declared before the dynamic segment. */}
            <Route element={<RequirePermission perm="Impresion:operar" />}>
              <Route path="/estacion/impresion" element={<Impresion />} />
            </Route>
            <Route path="/estacion/:station" element={<Estacion />} />
            <Route element={<RequirePermission perm="Turno:operar" />}>
              <Route path="/turno" element={<Turno />} />
            </Route>
            <Route element={<RequirePermission perm="Asistencia:checar" />}>
              <Route path="/checador" element={<Checador />} />
              <Route path="/asistencia" element={<Asistencia />} />
            </Route>
            <Route element={<RequirePermission perm="Inventario:ver" />}>
              <Route path="/inventario" element={<Inventario />} />
            </Route>
            <Route element={<RequirePermission perm="Reportes:ver" />}>
              <Route path="/reportes" element={<Reportes />} />
            </Route>
            <Route element={<RequirePermission perm="Ajustes:editar" />}>
              <Route path="/ajustes" element={<Ajustes />} />
            </Route>
            <Route element={<RequireBarAdmin />}>
              <Route path="/permisos" element={<Permisos />} />
            </Route>
            <Route path="/cuenta" element={<Cuenta />} />
            <Route path="/soporte" element={<Soporte />} />
            <Route path="/about" element={<About />} />
            <Route path="/staff" element={<Staff />} />
            <Route path="/super-admin" element={<SuperAdmin />} />
          </Route>
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <PermissionProvider>
          <Router>
            <ScrollToTop />
            <AuthenticatedApp />
          </Router>
          <Toaster />
        </PermissionProvider>
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
