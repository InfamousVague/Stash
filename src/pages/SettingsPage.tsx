import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@base/primitives/button';
import '@base/primitives/button/button.css';
import { Separator } from '@base/primitives/separator';
import '@base/primitives/separator/separator.css';
import { Toggle } from '@base/primitives/toggle';
import '@base/primitives/toggle/toggle.css';
import { Select } from '@base/primitives/select';
import '@base/primitives/select/select.css';
import { Badge } from '@base/primitives/badge';
import '@base/primitives/badge/badge.css';
import { Progress } from '@base/primitives/progress';
import '@base/primitives/progress/progress.css';
import { Icon } from '@base/primitives/icon';
import '@base/primitives/icon/icon.css';
import { scan } from '@base/primitives/icon/icons/scan';
import { lock } from '@base/primitives/icon/icons/lock';
import { terminal } from '@base/primitives/icon/icons/terminal';
import { download } from '@base/primitives/icon/icons/download';
import { copy } from '@base/primitives/icon/icons/copy';
import { useScanner } from '../hooks/useScanner';
import { useVault } from '../hooks/useVault';
import { useUpdater } from '../hooks/useUpdater';
import { useToastContext } from '../contexts/ToastContext';
import { ScanBanner } from '../components/ScanBanner';
import stashIcon from '../assets/stash-icon.png';
import './SettingsPage.css';

const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'hi', name: 'हिन्दी' },
  { code: 'bn', name: 'বাংলা' },
  { code: 'ta', name: 'தமிழ்' },
  { code: 'te', name: 'తెలుగు' },
  { code: 'mr', name: 'मराठी' },
  { code: 'gu', name: 'ગુજરાતી' },
  { code: 'kn', name: 'ಕನ್ನಡ' },
  { code: 'ml', name: 'മലയാളം' },
  { code: 'pa', name: 'ਪੰਜਾਬੀ' },
  { code: 'uk', name: 'Українська' },
  { code: 'pl', name: 'Polski' },
  { code: 'ko', name: '한국어' },
  { code: 'ja', name: '日本語' },
  { code: 'zh', name: '简体中文' },
];

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { scanning, progress, results, startScan, dismiss } = useScanner();
  const vault = useVault();
  const updater = useUpdater();
  const toast = useToastContext();
  const [cliInstalled, setCliInstalled] = useState(false);
  const [identityName, setIdentityName] = useState('');
  const [identitySource, setIdentitySource] = useState<'git' | 'env' | 'fallback'>('fallback');
  const [publicKey, setPublicKey] = useState('');
  const [hasKeypair, setHasKeypair] = useState(false);

  useEffect(() => {
    // Check if CLI is installed
    invoke<boolean>('check_cli_installed').then(setCliInstalled).catch(() => {});

    // Load identity info
    invoke<string>('get_git_username').then((name) => {
      if (name) {
        setIdentityName(name);
        setIdentitySource('git');
      } else {
        // Fall back to $USER
        const envUser = import.meta.env.VITE_USER || '';
        if (envUser) {
          setIdentityName(envUser);
          setIdentitySource('env');
        } else {
          setIdentityName('Me');
          setIdentitySource('fallback');
        }
      }
    }).catch(() => {
      setIdentityName('Me');
      setIdentitySource('fallback');
    });

    // Load public key
    invoke<string>('get_public_key').then((key) => {
      setPublicKey(key);
      setHasKeypair(true);
    }).catch(() => {
      setHasKeypair(false);
    });
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
          <h3 className="settings-page__section-title">{t('settings.appearance')}</h3>
          <div className="settings-page__row">
            <div>
              <span className="settings-page__row-label">{t('settings.darkMode')}</span>
              <span className="settings-page__row-desc">{t('settings.darkModeDesc')}</span>
            </div>
            <Toggle size="lg" checked={isDark} onChange={toggleTheme} />
          </div>
          <div className="settings-page__row">
            <div>
              <span className="settings-page__row-label">{t('settings.language')}</span>
              <span className="settings-page__row-desc">{t('settings.languageDesc')}</span>
            </div>
            <Select
              size="md"
              variant="outline"
              value={i18n.language?.split('-')[0] || 'en'}
              onChange={(e) => i18n.changeLanguage(e.target.value)}
            >
              {LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>{lang.name}</option>
              ))}
            </Select>
          </div>
        </section>

        <Separator />

        <section className="settings-page__section">
          <h3 className="settings-page__section-title">{t('settings.security')}</h3>
          <div className="settings-page__row">
            <div>
              <span className="settings-page__row-label">{t('settings.vaultStatus')}</span>
              <span className="settings-page__row-desc">
                {vault.unlocked ? t('settings.vaultUnlocked') : t('settings.vaultLocked')}
              </span>
            </div>
            {vault.unlocked && (
              <Button variant="secondary" size="md" icon={lock} onClick={vault.lock}>
                {t('settings.lockNow')}
              </Button>
            )}
          </div>
          <div className="settings-page__row">
            <div>
              <span className="settings-page__row-label">{t('settings.touchId')}</span>
              <span className="settings-page__row-desc">
                {vault.hasKeychain ? t('settings.touchIdEnabled') : t('settings.touchIdDisabled')}
              </span>
            </div>
            <Toggle
              size="lg"
              checked={vault.hasKeychain}
              onChange={async () => {
                try {
                  if (vault.hasKeychain) {
                    await vault.clearKeychain();
                    toast.info(t('settings.keychainDisabled'));
                  } else {
                    await vault.storeInKeychain();
                    toast.success(t('settings.keychainEnabled'));
                  }
                } catch (e) {
                  toast.error(`Failed: ${e}`);
                }
              }}
            />
          </div>
        </section>

        <Separator />

        <section className="settings-page__section">
          <h3 className="settings-page__section-title">{t('settings.identity')}</h3>
          <p className="settings-page__section-desc">{t('settings.identityDesc')}</p>

          <div className="settings-page__row">
            <div>
              <span className="settings-page__row-label">{t('settings.displayName')}</span>
              <span className="settings-page__row-desc">
                {identitySource === 'git'
                  ? t('settings.nameSourceGit')
                  : identitySource === 'env'
                  ? t('settings.nameSourceEnv')
                  : t('settings.nameSourceFallback')}
              </span>
            </div>
            <span className="settings-page__identity-name">{identityName}</span>
          </div>

          {hasKeypair && (
            <div className="settings-page__identity-key">
              <div className="settings-page__identity-key-header">
                <span className="settings-page__row-label">{t('settings.publicKey')}</span>
                <Badge variant="subtle" size="sm" color="success">{t('settings.x25519')}</Badge>
                <button
                  className="settings-page__copy-btn"
                  onClick={async () => {
                    await navigator.clipboard.writeText(publicKey);
                    toast.success(t('settings.keyCopied'));
                  }}
                  title={t('common.copy')}
                >
                  <Icon icon={copy} size="xs" color="currentColor" />
                  {t('common.copy')}
                </button>
              </div>
              <code className="settings-page__key-value">{publicKey}</code>
              <span className="settings-page__row-desc">{t('settings.publicKeyHint')}</span>
            </div>
          )}

          {!hasKeypair && (
            <div className="settings-page__row">
              <div>
                <span className="settings-page__row-label">{t('settings.publicKey')}</span>
                <span className="settings-page__row-desc">{t('settings.noKeypairHint')}</span>
              </div>
              <Badge variant="subtle" size="sm" color="neutral">{t('settings.noKeypair')}</Badge>
            </div>
          )}
        </section>

        <Separator />

        <section className="settings-page__section">
          <h3 className="settings-page__section-title">{t('settings.scanning')}</h3>
          <p className="settings-page__section-desc">
            {t('settings.scanDesc')}
          </p>
          <div className="settings-page__scan-dirs">
            {['~/Development', '~/Projects', '~/code', '~/repos', '~/work', '~/src'].map((dir) => (
              <code key={dir} className="settings-page__scan-dir">{dir}</code>
            ))}
          </div>
          <Button variant="secondary" size="md" icon={scan} onClick={startScan} disabled={scanning}>
            {scanning ? t('settings.scanningInProgress') : t('settings.rescan')}
          </Button>
        </section>

        <Separator />

        <section className="settings-page__section">
          <h3 className="settings-page__section-title">{t('settings.cli')}</h3>
          <p className="settings-page__section-desc">
            {t('settings.cliDesc')}
          </p>
          <div className="settings-page__row">
            <div>
              <span className="settings-page__row-label">
                {t('settings.installCli')}
                {cliInstalled && <Badge variant="subtle" size="sm" color="success" style={{ marginLeft: 8 }}>{t('settings.installed')}</Badge>}
              </span>
              <span className="settings-page__row-desc">
                {cliInstalled ? t('settings.cliAvailable') : t('settings.cliInstallPath')}
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
                  toast.success(t('settings.cliInstalledToast'));
                } catch (e) {
                  toast.error(t('settings.installFailed', { error: String(e) }));
                }
              }}
              disabled={cliInstalled}
            >
              {cliInstalled ? t('settings.installed') : t('settings.install')}
            </Button>
          </div>
          <pre className="settings-page__cli-preview">
{`$ stash pull          # decrypt .stash.lock → .env
$ stash push          # encrypt .env → .stash.lock
$ stash switch staging
$ stash run -- npm start`}
          </pre>
        </section>

        <Separator />

        <section className="settings-page__section">
          <h3 className="settings-page__section-title">{t('settings.updates')}</h3>
          <div className="settings-page__row">
            <div>
              <span className="settings-page__row-label">{t('settings.currentVersion')}</span>
              <span className="settings-page__row-desc">
                {updater.readyToRelaunch
                  ? t('settings.readyToRelaunch', { version: updater.updateAvailable?.version })
                  : updater.updateAvailable
                  ? t('settings.updateAvailable', { version: updater.updateAvailable.version })
                  : t('settings.upToDate')}
              </span>
            </div>
            {updater.readyToRelaunch ? (
              <Button variant="primary" size="md" onClick={updater.doRelaunch}>
                {t('settings.relaunch')}
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="md"
                icon={download}
                onClick={updater.updateAvailable ? updater.downloadAndInstall : updater.checkForUpdate}
                disabled={updater.checking || updater.downloading}
              >
                {updater.checking ? t('settings.checking') : updater.downloading ? t('settings.downloading') : updater.updateAvailable ? t('settings.updateNow') : t('settings.checkForUpdates')}
              </Button>
            )}
          </div>
          {updater.downloading && (
            <div className="settings-page__progress-row">
              <Progress value={updater.progress} size="md" />
              <span className="settings-page__progress-text">{updater.progress}%</span>
            </div>
          )}
        </section>

        <Separator />

        <section className="settings-page__section">
          <h3 className="settings-page__section-title">{t('settings.about')}</h3>
          <div className="settings-page__about">
            <img src={stashIcon} alt="Stash" className="settings-page__about-icon" />
            <div>
              <div className="settings-page__about-row">
                <span className="settings-page__about-label">Stash</span>
                <span className="settings-page__about-value">v0.2.0</span>
              </div>
              <div className="settings-page__about-row">
                <span className="settings-page__about-label">{t('settings.runtime')}</span>
                <span className="settings-page__about-value">Tauri v2</span>
              </div>
              <div className="settings-page__about-row">
                <span className="settings-page__about-label">{t('settings.encryption')}</span>
                <span className="settings-page__about-value">AES-256-GCM + Argon2id</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
