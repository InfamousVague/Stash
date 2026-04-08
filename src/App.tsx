import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Icon } from '@base/primitives/icon';
import '@base/primitives/icon/icon.css';
import { Button } from '@base/primitives/button';
import '@base/primitives/button/button.css';
import { shieldCheck } from '@base/primitives/icon/icons/shield-check';
import { radar } from '@base/primitives/icon/icons/radar';
import { bookOpen } from '@base/primitives/icon/icons/book-open';
import { settings } from '@base/primitives/icon/icons/settings';
import { lock } from '@base/primitives/icon/icons/lock';
import { VaultsPage } from './pages/VaultsPage';
import { DiscoverPage } from './pages/DiscoverPage';
import { DirectoryPage } from './pages/DirectoryPage';
import { SettingsPage } from './pages/SettingsPage';
import { UnlockScreen } from './components/UnlockScreen';
import { SetupWizard } from './components/SetupWizard';
import { ToastProvider } from './contexts/ToastContext';
import { useVault } from './hooks/useVault';
import './App.css';

type Page = 'vaults' | 'discover' | 'directory' | 'settings';

const NAV_ITEMS: { page: Page; label: string; icon: string }[] = [
  { page: 'vaults', label: 'Vaults', icon: shieldCheck },
  { page: 'discover', label: 'Discover', icon: radar },
  { page: 'directory', label: 'API Directory', icon: bookOpen },
  { page: 'settings', label: 'Settings', icon: settings },
];

function App() {
  const [page, setPage] = useState<Page>('vaults');
  const vault = useVault();
  const [setupComplete, setSetupComplete] = useState<boolean | null>(null);

  useEffect(() => {
    invoke<boolean>('is_setup_complete').then(setSetupComplete).catch(() => setSetupComplete(false));
  }, []);

  // Loading
  if (vault.initialized === null || setupComplete === null) return null;

  // Show unlock/init screen first
  if (!vault.initialized || !vault.unlocked) {
    return (
      <UnlockScreen
        initialized={vault.initialized}
        error={vault.error}
        onInit={vault.initVault}
        onUnlock={vault.unlock}
      />
    );
  }

  // Show setup wizard after unlock, before main app
  if (!setupComplete) {
    return <SetupWizard onComplete={() => setSetupComplete(true)} />;
  }

  return (
    <ToastProvider>
    <div className="stash">
      <aside className="stash__sidebar">
        <nav className="stash__nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.page}
              className={`stash__nav-item ${page === item.page ? 'stash__nav-item--active' : ''}`}
              onClick={() => setPage(item.page)}
            >
              <Icon icon={item.icon} size="sm" color="currentColor" />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="stash__sidebar-footer">
          <Button variant="ghost" size="sm" icon={lock} onClick={vault.lock}>
            Lock
          </Button>
        </div>
      </aside>
      <main className="stash__main">
        <header className="stash__header">
          <h1 className="stash__title">
            {NAV_ITEMS.find((n) => n.page === page)?.label}
          </h1>
        </header>
        <div className="stash__content">
          {page === 'vaults' && <VaultsPage />}
          {page === 'discover' && <DiscoverPage onNavigateToVaults={() => setPage('vaults')} />}
          {page === 'directory' && <DirectoryPage />}
          {page === 'settings' && <SettingsPage />}
        </div>
      </main>
    </div>
    </ToastProvider>
  );
}

export default App;
