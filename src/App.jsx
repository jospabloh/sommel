import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { PermissionProvider } from '@/lib/PermissionContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';
import Layout from '@/components/Layout';
import Menu from '@/pages/Menu';
import Mesas from '@/pages/Mesas';
import Orden from '@/pages/Orden';
import Estacion from '@/pages/Estacion';
import SuperAdmin from '@/pages/SuperAdmin';
import Staff from '@/pages/Staff';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
// Add page imports here

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app. Entrega 1 (docs/entrega-1-contratos.md §5): las
  // rutas del prototipo (/pos, /products, /tables) se eliminan con sus
  // páginas — '/' redirige a /mesas, que es donde arranca el flujo real
  // (mapa de mesas → comanda → envío a cocina/barra).
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
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
          <Route path="/estacion/:station" element={<Estacion />} />
          <Route path="/staff" element={<Staff />} />
          <Route path="/super-admin" element={<SuperAdmin />} />
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
