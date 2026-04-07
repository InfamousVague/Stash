import { useState } from 'react';
import { Icon } from '@base/primitives/icon';
import '@base/primitives/icon/icon.css';
import { shieldCheck } from '@base/primitives/icon/icons/shield-check';
import { bookOpen } from '@base/primitives/icon/icons/book-open';
import { settings } from '@base/primitives/icon/icons/settings';
import { VaultsPage } from './pages/VaultsPage';
import { DirectoryPage } from './pages/DirectoryPage';
import { SettingsPage } from './pages/SettingsPage';
import './App.css';

type Page = 'vaults' | 'directory' | 'settings';

const NAV_ITEMS: { page: Page; label: string; icon: string }[] = [
  { page: 'vaults', label: 'Vaults', icon: shieldCheck },
  { page: 'directory', label: 'API Directory', icon: bookOpen },
  { page: 'settings', label: 'Settings', icon: settings },
];

function App() {
  const [page, setPage] = useState<Page>('vaults');

  return (
    <div className="stash">
      <aside className="stash__sidebar">
        <div className="stash__sidebar-brand">
          <span className="stash__brand-text">Stash</span>
        </div>
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
      </aside>
      <main className="stash__main">
        <header className="stash__header">
          <h1 className="stash__title">
            {NAV_ITEMS.find((n) => n.page === page)?.label}
          </h1>
        </header>
        <div className="stash__content">
          {page === 'vaults' && <VaultsPage />}
          {page === 'directory' && <DirectoryPage />}
          {page === 'settings' && <SettingsPage />}
        </div>
      </main>
    </div>
  );
}

export default App;
