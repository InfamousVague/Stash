import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { Icon } from '@base/primitives/icon';
import '@base/primitives/icon/icon.css';
import { lock } from '@base/primitives/icon/icons/lock';
import { circleHelp } from '@base/primitives/icon/icons/circle-help';
import { Tour, type TourStep } from './components/Tour';
import { type Page, NAV_ITEMS, APP_TOUR_DEFS } from './constants/navigation';
import { useDeepLinks } from './hooks/useDeepLinks';
import { VaultsPage } from './pages/VaultsPage';
import { DiscoverPage } from './pages/DiscoverPage';
import { DirectoryPage } from './pages/DirectoryPage';
import { HealthPage } from './pages/HealthPage';
import { PeoplePage } from './pages/PeoplePage';
import { SavedKeysPage } from './pages/SavedKeysPage';
import { SettingsPage } from './pages/SettingsPage';
import { UnlockScreen } from './components/UnlockScreen';
import { SetupWizard } from './components/SetupWizard';
import { ToastProvider } from './contexts/ToastContext';
import { useVault } from './hooks/useVault';
import { useUpdater } from './hooks/useUpdater';
import { UpdateBanner } from './components/UpdateBanner';
import { IdentityPrompt } from './components/IdentityPrompt';
import './App.css';

function App() {
  const { t } = useTranslation();
  const [page, setPage] = useState<Page>('vaults');
  const [pendingContact, setPendingContact] = useState<{ name: string; key: string } | null>(null);
  const [pendingImport, setPendingImport] = useState<{ service: string; envKey: string } | null>(null);
  const [tourActive, setTourActive] = useState(() => {
    return localStorage.getItem('stash-tour-completed') !== 'true';
  });
  const [tourStep, setTourStep] = useState(0);
  const vault = useVault();
  const updater = useUpdater();
  const [setupComplete, setSetupComplete] = useState<boolean | null>(null);
  const [healthIssues, setHealthIssues] = useState(0);
  const navRef = useRef<HTMLElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState<React.CSSProperties>({ opacity: 0 });

  const appTour: TourStep[] = useMemo(() => APP_TOUR_DEFS.map((d) => ({
    target: d.target,
    title: t(d.titleKey),
    body: t(d.bodyKey),
    icon: d.icon,
    iconColor: d.iconColor,
    placement: d.placement,
    page: d.page,
  })), [t]);

  const activeColor = NAV_ITEMS.find((i) => i.page === page)?.iconColor ?? '#6b7280';

  const updateIndicator = useCallback(() => {
    if (!navRef.current) return;
    const activeBtn = navRef.current.querySelector('.stash__nav-item--active') as HTMLElement;
    if (activeBtn) {
      const navRect = navRef.current.getBoundingClientRect();
      const btnRect = activeBtn.getBoundingClientRect();
      setIndicatorStyle({
        top: btnRect.top - navRect.top,
        height: btnRect.height,
        opacity: 1,
        background: `${activeColor}22`,
      });
    }
  }, [activeColor]);

  useEffect(() => {
    // Double-rAF to ensure the DOM has fully laid out with the active class
    requestAnimationFrame(() => requestAnimationFrame(updateIndicator));
  }, [page, updateIndicator]);

  // Re-position indicator on window resize
  useEffect(() => {
    window.addEventListener('resize', updateIndicator);
    return () => window.removeEventListener('resize', updateIndicator);
  }, [updateIndicator]);

  useEffect(() => {
    invoke<boolean>('is_setup_complete').then(setSetupComplete).catch(() => setSetupComplete(false));
  }, []);

  // Fetch health issue count for badge — re-check when switching pages (in case user fixed issues)
  useEffect(() => {
    if (vault.unlocked && setupComplete) {
      invoke<{ summary: { critical: number; warning: number } }>('get_health_report')
        .then((r) => setHealthIssues(r.summary.critical + r.summary.warning))
        .catch(() => setHealthIssues(0));
    }
  }, [vault.unlocked, setupComplete, page]);

  // Listen for deep links (stash://add-contact?name=...&key=...)
  useDeepLinks({
    onAddContact: useCallback((name: string, key: string) => {
      setPendingContact({ name, key });
      setPage('people');
    }, []),
    onImportVar: useCallback((from: string, varKey: string, _enc: string) => {
      // Decrypt and prompt to save — handled by vault page
      setPendingImport({ service: `Shared by ${from}`, envKey: varKey });
      setPage('savedkeys');
    }, []),
    onImportKey: useCallback((service: string, envKey: string) => {
      setPendingImport({ service, envKey });
      setPage('savedkeys');
    }, []),
    onAuthComplete: useCallback(async (token: string) => {
      try {
        await invoke('relay_save_token', { token });
        setPage('settings');
        // Dispatch event so SettingsPage refreshes relay status
        window.dispatchEvent(new CustomEvent('stash-relay-connected'));
      } catch (e) {
        console.error('Failed to save auth token:', e);
      }
    }, []),
  });

  // Listen for cross-component navigation events (e.g. Settings → People link)
  useEffect(() => {
    const handler = (e: Event) => {
      const target = (e as CustomEvent).detail;
      if (target && NAV_ITEMS.some((i) => i.page === target)) {
        setPage(target as Page);
      }
    };
    window.addEventListener('stash-navigate', handler);
    return () => window.removeEventListener('stash-navigate', handler);
  }, []);

  // Reset page to vaults when vault locks
  useEffect(() => {
    if (!vault.unlocked) {
      setPage('vaults');
    }
  }, [vault.unlocked]);

  // Handle pending Touch ID setup after successful unlock
  useEffect(() => {
    if (vault.unlocked && setupComplete && localStorage.getItem('stash-pending-touchid-setup') === 'true') {
      localStorage.removeItem('stash-pending-touchid-setup');
      const timer = setTimeout(async () => {
        try {
          await vault.storeInKeychain();
          // hasKeychain is set to true inside storeInKeychain
        } catch (e) {
          console.error('Touch ID setup failed:', e);
        }
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [vault.unlocked, setupComplete]);

  // Loading
  if (vault.initialized === null || setupComplete === null) return null;

  // Show unlock/init screen first
  if (!vault.initialized || !vault.unlocked) {
    return (
      <UnlockScreen
        initialized={vault.initialized}
        error={vault.error}
        hasKeychain={vault.hasKeychain}
        onInit={vault.initVault}
        onUnlock={vault.unlock}
        onUnlockKeychain={vault.unlockFromKeychain}
        onEnableKeychain={vault.storeInKeychain}
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
        <nav className="stash__nav" ref={(node) => {
          navRef.current = node;
          if (node) {
            // Nav just mounted — position indicator after layout settles
            requestAnimationFrame(() => requestAnimationFrame(updateIndicator));
          }
        }}>
          <div className="stash__nav-indicator" style={indicatorStyle} />
          {NAV_ITEMS.map((item) => {
            const isActive = page === item.page;
            return (
              <button
                key={item.page}
                className={`stash__nav-item ${isActive ? 'stash__nav-item--active' : ''}`}
                onClick={() => setPage(item.page)}
                style={isActive ? { color: item.iconColor } : undefined}
              >
                <span style={{ color: item.iconColor }}><Icon icon={item.icon} size="base" color="currentColor" /></span>
                <span>{t(item.labelKey)}</span>
                {item.page === 'health' && healthIssues > 0 && (
                  <span className="stash__nav-badge" />
                )}
              </button>
            );
          })}
        </nav>
        <div className="stash__sidebar-footer">
          <button className="stash__nav-item" onClick={() => setTourActive(true)}>
            <Icon icon={circleHelp} size="base" color="tertiary" />
            <span>{t('nav.help')}</span>
          </button>
          <button className="stash__nav-item" onClick={vault.lock}>
            <Icon icon={lock} size="base" color="tertiary" />
            <span>{t('nav.lock')}</span>
          </button>
        </div>
      </aside>
      <main className="stash__main">
        {updater.updateAvailable && (!updater.dismissed || updater.readyToRelaunch) && (
          <UpdateBanner
            version={updater.updateAvailable.version}
            downloading={updater.downloading}
            progress={updater.progress}
            readyToRelaunch={updater.readyToRelaunch}
            onUpdate={updater.downloadAndInstall}
            onRelaunch={updater.doRelaunch}
            onDismiss={updater.dismiss}
          />
        )}
        <div className="stash__content" key={page}>
          {page === 'vaults' && <VaultsPage tourShowDemo={tourActive && (tourStep === 1 || tourStep === 2)} onNavigateToDiscover={() => setPage('discover')} />}
          {page === 'discover' && <DiscoverPage onNavigateToVaults={() => setPage('vaults')} />}
          {page === 'directory' && <DirectoryPage />}
          {page === 'savedkeys' && (
            <SavedKeysPage
              pendingImport={pendingImport}
              onPendingHandled={() => setPendingImport(null)}
            />
          )}
          {page === 'health' && <HealthPage />}
          {page === 'people' && (
            <PeoplePage
              pendingContact={pendingContact}
              onPendingHandled={() => setPendingContact(null)}
            />
          )}
          {page === 'settings' && <SettingsPage />}
        </div>
      </main>
    </div>
    <IdentityPrompt />
    <Tour
      steps={appTour}
      active={tourActive}
      onNavigate={(p) => setPage(p as Page)}
      onStepChange={setTourStep}
      onComplete={() => { setTourActive(false); setTourStep(0); localStorage.setItem('stash-tour-completed', 'true'); }}
    />
    </ToastProvider>
  );
}

export default App;
