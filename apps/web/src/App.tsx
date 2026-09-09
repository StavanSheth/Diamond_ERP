import { Routes, Route, Navigate } from 'react-router-dom';
import { Sidebar } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';
import { DashboardPage } from './pages/DashboardPage';
import { InventoryPage } from './pages/InventoryPage';
import { LedgerPage } from './pages/LedgerPage';
import { CertificatesPage } from './pages/CertificatesPage';
import { PartiesPage } from './pages/PartiesPage';
import { RepairsPage } from './pages/RepairsPage';
import { SettingsPage } from './pages/SettingsPage';
import { ReportsPage } from './pages/ReportsPage';
import { LoginPage } from './pages/auth/LoginPage';
import { useStocks } from './hooks/useStocks';
import { AppLockProvider } from './contexts/AppLockContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AppLockOverlay } from './components/security/AppLockOverlay';
import { FirstRunActivationOverlay } from './components/security/FirstRunActivationOverlay';
import { Loader2 } from 'lucide-react';

function AppContent() {
  const { user, loading: authLoading } = useAuth();
  
  const {
    stocks,
    loading: stocksLoading,
    error,
    lastSyncedAt,
    syncStatus,
    createStock,
    updateStock,
    deleteStock,
    refresh,
  } = useStocks();

  if (authLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-background">
        <Loader2 className="animate-spin h-8 w-8 text-primary" />
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <div className="bg-background text-on-surface h-screen flex overflow-hidden">
      {/* First-Run Master Lifetime Activation Lock */}
      <FirstRunActivationOverlay />

      {/* App Lock Fullscreen Overlay */}
      <AppLockOverlay />

      {/* Sidebar (desktop) */}
      <Sidebar syncStatus={syncStatus} lastSyncedAt={lastSyncedAt} />

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar (mobile) */}
        <TopBar syncStatus={syncStatus} onRefresh={refresh} />

        {/* Pages */}
        <Routes>
          <Route
            path="/"
            element={
              <DashboardPage
                stocks={stocks}
                loading={stocksLoading}
                lastSyncedAt={lastSyncedAt}
              />
            }
          />
          <Route
            path="/inventory"
            element={
              <InventoryPage
                stocks={stocks}
                loading={stocksLoading}
                error={error}
                createStock={createStock}
                updateStock={updateStock}
                deleteStock={deleteStock}
              />
            }
          />
          <Route path="/ledger" element={<LedgerPage />} />
          <Route path="/certificates" element={<CertificatesPage />} />
          <Route path="/parties" element={<PartiesPage />} />
          <Route path="/repairs" element={<RepairsPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppLockProvider>
        <AppContent />
      </AppLockProvider>
    </AuthProvider>
  );
}

export default App;

