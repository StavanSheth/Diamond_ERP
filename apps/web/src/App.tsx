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
import { useStocks } from './hooks/useStocks';
import { AppLockProvider } from './contexts/AppLockContext';
import { AppLockOverlay } from './components/security/AppLockOverlay';

function AppContent() {
  const {
    stocks,
    loading,
    error,
    lastSyncedAt,
    syncStatus,
    createStock,
    updateStock,
    deleteStock,
    refresh,
  } = useStocks();

  return (
    <div className="bg-background text-on-surface h-screen flex overflow-hidden">
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
                loading={loading}
                lastSyncedAt={lastSyncedAt}
              />
            }
          />
          <Route
            path="/inventory"
            element={
              <InventoryPage
                stocks={stocks}
                loading={loading}
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
    <AppLockProvider>
      <AppContent />
    </AppLockProvider>
  );
}

export default App;

