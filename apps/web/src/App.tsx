import { useState, useEffect } from 'react';
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
import { AppLockProvider, useAppLock } from './contexts/AppLockContext';
import { AuthProvider } from './contexts/AuthContext';
import { AppLockOverlay } from './components/security/AppLockOverlay';
import { FirstRunActivationOverlay } from './components/security/FirstRunActivationOverlay';
import { OnboardingWizard } from './components/onboarding/OnboardingWizard';
import { api } from './services/api';

/**
 * Main ERP Business Application Layout and Router.
 * Mounted strictly ONLY when lifecycle is READY and screen is unlocked.
 */
function ErpAppLayout() {
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

  return (
    <div className="bg-background text-on-surface h-screen flex overflow-hidden">
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

/**
 * Sequential Security & Lifecycle Gated Application Hierarchy.
 * Application Entry → Lifecycle Gate → Security/PIN Gate → ERP Load
 */
function AppContent() {
  const { isLocked } = useAppLock();
  const [onboardingReady, setOnboardingReady] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    api.onboarding
      .getStatus()
      .then((status) => {
        if (active) setOnboardingReady(status.ready || status.lifecycleState === 'READY');
      })
      .catch(() => {
        if (active) setOnboardingReady(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <>
      {/* 1. First-Run Master Lifetime Activation Lock */}
      <FirstRunActivationOverlay />

      {/* 2. First-Run Onboarding & Database Setup Wizard */}
      <OnboardingWizard onReady={() => setOnboardingReady(true)} />

      {/* 3. App Lock Fullscreen Overlay */}
      <AppLockOverlay />

      {/* 4. ERP Business Application — Mounted ONLY when lifecycle is READY */}
      {onboardingReady && !isLocked && <ErpAppLayout />}
    </>
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

