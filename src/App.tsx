import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { RestaurantProvider } from './context/RestaurantContext';
import { AdminLayout } from './components/layout/AdminLayout';
import { AdminView } from './components/layout/Sidebar';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { RestaurantSetupPage } from './pages/RestaurantSetupPage';
import { CategoriesPage } from './pages/CategoriesPage';
import { ItemsPage } from './pages/ItemsPage';
import { PosPage } from './pages/PosPage';
import { KitchenPage } from './pages/KitchenPage';
import { CaptainPage } from './pages/CaptainPage';
import { ReportsPage } from './pages/ReportsPage';
import { AuditPage } from './pages/AuditPage';
import { OrdersPage } from './pages/OrdersPage';
import { StaffPage } from './pages/StaffPage';
import { InventoryPage } from './pages/InventoryPage';
import { AcceptInvitationPage } from './pages/AcceptInvitationPage';
import { UtensilsCrossed, ShieldAlert } from 'lucide-react';
import { isViewAllowed } from './utils/permissions';

const AdminApp: React.FC = () => {
  const { user, profile, loading } = useAuth();
  const [currentView, setCurrentView] = useState<AdminView>('pos');

  // Check if current URL is an invitation acceptance route
  const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const hasToken = Boolean(urlParams.get('token'));
  const isAcceptInvitationRoute = typeof window !== 'undefined' && (window.location.pathname === '/accept-invitation' || hasToken);

  if (isAcceptInvitationRoute) {
    return <AcceptInvitationPage onComplete={() => { window.location.href = '/'; }} />;
  }

  const userRole = profile?.role || 'owner';

  // Automatically correct/redirect currentView if it is unauthorized for the user's role
  useEffect(() => {
    if (user && profile) {
      const role = profile.role || 'owner';
      if (!isViewAllowed(role, currentView)) {
        const views: AdminView[] = ['pos', 'captain', 'kitchen', 'orders', 'inventory', 'dashboard', 'staff', 'restaurant', 'categories', 'items', 'reports', 'audit'];
        const firstAllowed = views.find((v) => isViewAllowed(role, v));
        if (firstAllowed) {
          setCurrentView(firstAllowed);
        }
      }
    }
  }, [user, profile, currentView]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-500 flex items-center justify-center text-white shadow-2xl shadow-indigo-600/40 animate-pulse mb-4">
          <UtensilsCrossed className="w-8 h-8" />
        </div>
        <h1 className="text-xl font-bold text-white tracking-tight">RestaurantOS</h1>
        <p className="text-xs text-slate-400 mt-1">Connecting to Firestore cloud database...</p>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  const allowedToView = isViewAllowed(userRole, currentView);

  return (
    <RestaurantProvider>
      <AdminLayout currentView={currentView} onNavigate={setCurrentView}>
        {allowedToView ? (
          <>
            {currentView === 'pos' && <PosPage onNavigate={setCurrentView} />}
            {currentView === 'captain' && <CaptainPage onNavigate={setCurrentView} />}
            {currentView === 'kitchen' && <KitchenPage />}
            {currentView === 'orders' && <OrdersPage />}
            {currentView === 'inventory' && <InventoryPage />}
            {currentView === 'dashboard' && <DashboardPage onNavigate={setCurrentView} />}
            {currentView === 'staff' && <StaffPage />}
            {currentView === 'restaurant' && <RestaurantSetupPage />}
            {currentView === 'categories' && <CategoriesPage />}
            {currentView === 'items' && <ItemsPage />}
            {currentView === 'reports' && <ReportsPage />}
            {currentView === 'audit' && <AuditPage />}
            {currentView === 'settings' && <RestaurantSetupPage />}
          </>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center max-w-md mx-auto my-12 shadow-sm">
            <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-4 border border-red-200/60">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <h2 className="text-base font-bold text-slate-900 mb-1.5">Unauthorized View</h2>
            <p className="text-xs text-slate-600 mb-6 leading-relaxed">
              Your staff role ({userRole}) does not have permission to access the "{currentView}" panel.
            </p>
          </div>
        )}
      </AdminLayout>
    </RestaurantProvider>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <AdminApp />
    </AuthProvider>
  );
}
