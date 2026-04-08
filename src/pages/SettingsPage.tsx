import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@base/primitives/button';
import '@base/primitives/button/button.css';
import { Separator } from '@base/primitives/separator';
import '@base/primitives/separator/separator.css';
import { Toggle } from '@base/primitives/toggle';
import '@base/primitives/toggle/toggle.css';
import { Badge } from '@base/primitives/badge';
import '@base/primitives/badge/badge.css';
import { scan } from '@base/primitives/icon/icons/scan';
import { lock } from '@base/primitives/icon/icons/lock';
import { terminal } from '@base/primitives/icon/icons/terminal';
import { useScanner } from '../hooks/useScanner';
import { useVault } from '../hooks/useVault';
import { useToastContext } from '../contexts/ToastContext';
import { ScanBanner } from '../components/ScanBanner';
import stashIcon from '../assets/stash-icon.png';
import './SettingsPage.css';

export function SettingsPage() {
  const { scanning, progress, results, startScan, dismiss } = useScanner();
  const vault = useVault();
  const toast = useToastContext();
  const [cliInstalled, setCliInstalled] = useState(false);

  useEffect(() => {
    // Check if CLI is installed
    invoke<boolean>('check_cli_installed').then(setCliInstalled).catch(() => {});
  }, []);

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  const toggleTheme = () => {
    const next = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('stash-theme', next);
  };

  return (
    <div className="settings-page">
      {(scanning || progress) && (
        <ScanBanner scanning={scanning} progress={progress} results={results} onDismiss={dismiss} />
      )}

      <div className="settings-page__content">
        <section className="settings-page__section">
          <h3 className="settings-page__section-title">Appearance</h3>
          <div className="settings-page__row">
            <div>
              <span className="settings-page__row-label">Dark Mode</span>
              <span className="settings-page__row-desc">Toggle between light and dark theme</span>
            </div>
            <Toggle checked={isDark} onChange={toggleTheme} />
          </div>
        </section>

        <Separator />

        <section className="settings-page__section">
          <h3 className="settings-page__section-title">Security</h3>
          <div className="settings-page__row">
            <div>
              <span className="settings-page__row-label">Vault Status</span>
              <span className="settings-page__row-desc">
                {vault.unlocked ? 'Unlocked — your vault is accessible' : 'Locked'}
              </span>
            </div>
            {vault.unlocked && (
              <Button variant="secondary" size="md" icon={lock} onClick={vault.lock}>
                Lock Now
              </Button>
            )}
          </div>
        </section>

        <Separator />

        <section className="settings-page__section">
          <h3 className="settings-page__section-title">Scanning</h3>
          <p className="settings-page__section-desc">
            Stash scans ~/Development, ~/Projects, ~/code, ~/repos, ~/work, and ~/src for .env files.
          </p>
          <div className="settings-page__scan-dirs">
            {['~/Development', '~/Projects', '~/code', '~/repos', '~/work', '~/src'].map((dir) => (
              <code key={dir} className="settings-page__scan-dir">{dir}</code>
            ))}
          </div>
          <Button variant="secondary" size="md" icon={scan} onClick={startScan} disabled={scanning}>
            {scanning ? 'Scanning...' : 'Re-scan Directories'}
          </Button>
        </section>

        <Separator />

        <section className="settings-page__section">
          <h3 className="settings-page__section-title">CLI</h3>
          <p className="settings-page__section-desc">
            Use Stash from the terminal with commands like <code>stash pull</code>, <code>stash push</code>, and <code>stash switch</code>.
          </p>
          <div className="settings-page__row">
            <div>
              <span className="settings-page__row-label">
                Install CLI
                {cliInstalled && <Badge variant="subtle" size="sm" color="success" style={{ marginLeft: 8 }}>Installed</Badge>}
              </span>
              <span className="settings-page__row-desc">
                {cliInstalled ? 'stash is available in your terminal' : 'Installs to /usr/local/bin/stash'}
              </span>
            </div>
            <Button
              variant="secondary"
              size="md"
              icon={terminal}
              onClick={async () => {
                try {
                  await invoke('install_cli');
                  setCliInstalled(true);
                  toast.success('CLI installed to /usr/local/bin/stash');
                } catch (e) {
                  toast.error(`Install failed: ${e}`);
                }
              }}
              disabled={cliInstalled}
            >
              {cliInstalled ? 'Installed' : 'Install'}
            </Button>
          </div>
        </section>

        <Separator />

        <section className="settings-page__section">
          <h3 className="settings-page__section-title">About</h3>
          <div className="settings-page__about">
            <img src={stashIcon} alt="Stash" className="settings-page__about-icon" />
            <div>
              <div className="settings-page__about-row">
                <span className="settings-page__about-label">Stash</span>
                <span className="settings-page__about-value">v0.2.0</span>
              </div>
              <div className="settings-page__about-row">
                <span className="settings-page__about-label">Runtime</span>
                <span className="settings-page__about-value">Tauri v2</span>
              </div>
              <div className="settings-page__about-row">
                <span className="settings-page__about-label">Encryption</span>
                <span className="settings-page__about-value">AES-256-GCM + Argon2id</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
