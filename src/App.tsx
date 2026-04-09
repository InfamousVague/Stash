import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { onOpenUrl } from '@tauri-apps/plugin-deep-link';
import { Icon } from '@base/primitives/icon';
import '@base/primitives/icon/icon.css';
import { shieldCheck } from '@base/primitives/icon/icons/shield-check';
import { radar } from '@base/primitives/icon/icons/radar';
import { bookOpen } from '@base/primitives/icon/icons/book-open';
import { bookUser } from '@base/primitives/icon/icons/book-user';
import { settings } from '@base/primitives/icon/icons/settings';
import { activity } from '@base/primitives/icon/icons/activity';
import { users } from '@base/primitives/icon/icons/users';
import { lock } from '@base/primitives/icon/icons/lock';
import { circleHelp } from '@base/primitives/icon/icons/circle-help';
import { shieldCheck as shieldCheckIcon } from '@base/primitives/icon/icons/shield-check';
import { radar as radarIcon } from '@base/primitives/icon/icons/radar';
import { bookOpen as bookOpenIcon } from '@base/primitives/icon/icons/book-open';
import { activity as activityIcon } from '@base/primitives/icon/icons/activity';
import { users as usersIcon } from '@base/primitives/icon/icons/users';
import { key as keyIcon } from '@base/primitives/icon/icons/key';
import { keyRound } from '@base/primitives/icon/icons/key-round';
import { fingerprint } from '@base/primitives/icon/icons/fingerprint';
import { sparkles } from '@base/primitives/icon/icons/sparkles';
import { Tour, type TourStep } from './components/Tour';
import { VaultsPage } from './pages/VaultsPage';
import { DiscoverPage } from './pages/DiscoverPage';
import { DirectoryPage } from './pages/DirectoryPage';
import { HealthPage } from './pages/HealthPage';
import { DevelopersPage } from './pages/DevelopersPage';
import { ContactsPage } from './pages/ContactsPage';
import { SavedKeysPage } from './pages/SavedKeysPage';
import { SettingsPage } from './pages/SettingsPage';
import { UnlockScreen } from './components/UnlockScreen';
import { SetupWizard } from './components/SetupWizard';
import { ToastProvider } from './contexts/ToastContext';
import { useVault } from './hooks/useVault';
import { useUpdater } from './hooks/useUpdater';
import { UpdateBanner } from './components/UpdateBanner';
import './App.css';

type Page = 'vaults' | 'discover' | 'directory' | 'savedkeys' | 'health' | 'developers' | 'contacts' | 'settings';

const NAV_ITEMS: { page: Page; labelKey: string; icon: string; iconColor: string }[] = [
  { page: 'vaults', labelKey: 'nav.vaults', icon: shieldCheck, iconColor: '#22c55e' },
  { page: 'discover', labelKey: 'nav.discover', icon: radar, iconColor: '#3b82f6' },
  { page: 'directory', labelKey: 'nav.directory', icon: bookOpen, iconColor: '#a78bfa' },
  { page: 'savedkeys', labelKey: 'nav.savedKeys', icon: keyRound, iconColor: '#f97316' },
  { page: 'health', labelKey: 'nav.health', icon: activity, iconColor: '#f59e0b' },
  { page: 'developers', labelKey: 'nav.teams', icon: users, iconColor: '#06b6d4' },
  { page: 'contacts', labelKey: 'nav.contacts', icon: bookUser, iconColor: '#ec4899' },
  { page: 'settings', labelKey: 'nav.settings', icon: settings, iconColor: '#6b7280' },
];

const APP_TOUR_DEFS: { target: string; titleKey: string; bodyKey: string; icon: string; iconColor: string; placement: 'top' | 'bottom' | 'left' | 'right'; page: string }[] = [
  { target: '.stash__nav', titleKey: 'tour.welcome.title', bodyKey: 'tour.welcome.body', icon: sparkles, iconColor: '#a78bfa', placement: 'right', page: 'vaults' },
  { target: '.vaults-page__list-actions', titleKey: 'tour.vaults.title', bodyKey: 'tour.vaults.body', icon: shieldCheckIcon, iconColor: '#22c55e', placement: 'bottom', page: 'vaults' },
  { target: '.vaults-page__detail-tabs', titleKey: 'tour.editor.title', bodyKey: 'tour.editor.body', icon: keyIcon, iconColor: '#f59e0b', placement: 'bottom', page: 'vaults' },
  { target: '.discover-page__toolbar', titleKey: 'tour.discover.title', bodyKey: 'tour.discover.body', icon: radarIcon, iconColor: '#3b82f6', placement: 'bottom', page: 'discover' },
  { target: '.directory-page__controls', titleKey: 'tour.directory.title', bodyKey: 'tour.directory.body', icon: bookOpenIcon, iconColor: '#a78bfa', placement: 'bottom', page: 'directory' },
  { target: '.health-page__summary', titleKey: 'tour.health.title', bodyKey: 'tour.health.body', icon: activityIcon, iconColor: '#f59e0b', placement: 'bottom', page: 'health' },
  { target: '.developers-page__section-header', titleKey: 'tour.team.title', bodyKey: 'tour.team.body', icon: usersIcon, iconColor: '#06b6d4', placement: 'right', page: 'developers' },
  { target: '.vaults-create-btn', titleKey: 'tour.getStarted.title', bodyKey: 'tour.getStarted.body', icon: fingerprint, iconColor: '#22c55e', placement: 'top', page: 'vaults' },
];

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
        background: `${activeColor}18`,
      });
    }
  }, [activeColor]);

  useEffect(() => {
    // Small delay to let DOM update with the active class
    requestAnimationFrame(updateIndicator);
  }, [page, updateIndicator]);

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
  useEffect(() => {
    // onOpenUrl throws outside Tauri (e.g. in browser / E2E tests)
    if (!(window as any).__TAURI_INTERNALS__) return;
    const unlisten = onOpenUrl((urls) => {
      for (const url of urls) {
        try {
          const parsed = new URL(url);
          if (parsed.protocol === 'stash:' && parsed.hostname === 'add-contact') {
            const name = parsed.searchParams.get('name') || '';
            const key = parsed.searchParams.get('key') || '';
            if (name && key) {
              setPendingContact({ name, key });
              setPage('contacts');
            }
          }
          if (parsed.protocol === 'stash:' && parsed.hostname === 'import-key') {
            const service = parsed.searchParams.get('service') || '';
            const envKey = parsed.searchParams.get('envKey') || '';
            setPendingImport({ service, envKey });
            setPage('savedkeys');
          }
        } catch (e) {
          console.error('Failed to parse deep link:', e);
        }
      }
    });
    return () => { unlisten.then(fn => fn()); };
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
        <nav className="stash__nav" ref={navRef}>
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
        {updater.updateAvailable && !updater.dismissed && (
          <UpdateBanner
            version={updater.updateAvailable.version}
            downloading={updater.downloading}
            progress={updater.progress}
            onUpdate={updater.downloadAndInstall}
            onDismiss={updater.dismiss}
          />
        )}
        <div className="stash__content" key={page}>
          {page === 'vaults' && <VaultsPage tourShowDemo={tourActive && tourStep === 2} />}
          {page === 'discover' && <DiscoverPage onNavigateToVaults={() => setPage('vaults')} />}
          {page === 'directory' && <DirectoryPage />}
          {page === 'savedkeys' && (
            <SavedKeysPage
              pendingImport={pendingImport}
              onPendingHandled={() => setPendingImport(null)}
            />
          )}
          {page === 'health' && <HealthPage />}
          {page === 'developers' && <DevelopersPage />}
          {page === 'contacts' && (
            <ContactsPage
              pendingContact={pendingContact}
              onPendingHandled={() => setPendingContact(null)}
            />
          )}
          {page === 'settings' && <SettingsPage />}
        </div>
      </main>
    </div>
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
