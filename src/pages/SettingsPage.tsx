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
import { scan } from '@base/primitives/icon/icons/scan';
import { lock } from '@base/primitives/icon/icons/lock';
import { terminal } from '@base/primitives/icon/icons/terminal';
import { download } from '@base/primitives/icon/icons/download';
import { users } from '@base/primitives/icon/icons/users';
import { watch } from '@base/primitives/icon/icons/watch';
import { link2 } from '@base/primitives/icon/icons/link-2';
import { unplug } from '@base/primitives/icon/icons/unplug';
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
  const [relayConnected, setRelayConnected] = useState(false);
  const [relayUrl, setRelayUrl] = useState('');
  const [linkCodeInput, setLinkCodeInput] = useState('');
  const [relayLoading, setRelayLoading] = useState(false);
  const [generatedCode, setGeneratedCode] = useState('');
  const [workspaceLabel, setWorkspaceLabel] = useState('');
  const [workspaceLabelDraft, setWorkspaceLabelDraft] = useState('');
  const [linkedDevices, setLinkedDevices] = useState<{ device_id: string; public_key: string; device_type: string; label?: string; lan_ip?: string }[]>([]);
  const [daemonRunning, setDaemonRunning] = useState(true);
  const [daemonInstalled, setDaemonInstalled] = useState(true);
  const [installingDaemon, setInstallingDaemon] = useState(false);

  const refreshRelayStatus = async () => {
    try {
      const status = await invoke<{ connected: boolean; relay_url: string }>('relay_get_status');
      setRelayConnected(status.connected);
      setRelayUrl(status.relay_url);
    } catch {
      // ignore
    }
  };

  const refreshWorkspaceLabel = async () => {
    try {
      const label = await invoke<string>('relay_get_workspace_label');
      setWorkspaceLabel(label);
      setWorkspaceLabelDraft(label);
    } catch {
      // ignore
    }
  };

  const refreshLinkedDevices = async () => {
    try {
      const result = await invoke<{ devices: typeof linkedDevices }>('relay_get_linked_devices');
      setLinkedDevices(result.devices ?? []);
    } catch {
      // ignore — not linked yet
    }
  };

  const linkedWatches = linkedDevices.filter(d => d.device_type === 'watch');
  const linkedMacs = linkedDevices.filter(d => d.device_type === 'mac');

  useEffect(() => {
    // Check if CLI is installed
    invoke<boolean>('check_cli_installed').then(setCliInstalled).catch(() => {});
    refreshRelayStatus();
    refreshWorkspaceLabel();
    refreshLinkedDevices();

    // Check daemon status
    const checkDaemon = async () => {
      try {
        const status = await invoke<{ running: boolean; launchAgentInstalled: boolean }>('relay_daemon_status');
        setDaemonRunning(status.running);
        setDaemonInstalled(status.launchAgentInstalled);
      } catch { /* ignore */ }
    };
    checkDaemon();

    // Poll relay status + devices + daemon every 5 seconds
    const interval = setInterval(() => {
      refreshRelayStatus();
      refreshLinkedDevices();
      checkDaemon();
    }, 5000);

    // Listen for auth-complete deep link event
    const onRelayConnected = () => {
      refreshRelayStatus();
      refreshLinkedDevices();
      toast.success('Signed in with Apple successfully');
    };
    window.addEventListener('stash-relay-connected', onRelayConnected);

    return () => {
      clearInterval(interval);
      window.removeEventListener('stash-relay-connected', onRelayConnected);
    };
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
              <span className="settings-page__row-label">{t('settings.identityManaged')}</span>
              <span className="settings-page__row-desc">{t('settings.identityManagedDesc')}</span>
            </div>
            <Button variant="secondary" size="md" icon={users} onClick={() => {
              // Dispatch a custom event that App.tsx listens for to navigate
              window.dispatchEvent(new CustomEvent('stash-navigate', { detail: 'people' }));
            }}>
              {t('settings.goToPeople')}
            </Button>
          </div>
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
          <h3 className="settings-page__section-title">Watch & Relay</h3>
          <p className="settings-page__section-desc">
            Connect to the Stash relay to sync secrets with your Apple Watch and other devices.
          </p>

          {/* Daemon status banner */}
          {(!daemonRunning || !daemonInstalled) && relayConnected && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 14px',
              borderRadius: 10,
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              marginBottom: 12,
            }}>
              <span style={{ fontSize: 20 }}>⚠️</span>
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>
                  {!daemonInstalled ? 'Sync daemon not set up' : 'Sync daemon not running'}
                </span>
                <span style={{ display: 'block', fontSize: 11, opacity: 0.6, marginTop: 2 }}>
                  {!daemonInstalled
                    ? 'Install the background daemon so your projects sync automatically to your watch.'
                    : 'The daemon stopped. Click to restart it.'}
                </span>
              </div>
              <button
                disabled={installingDaemon}
                onClick={async () => {
                  setInstallingDaemon(true);
                  try {
                    await invoke('relay_install_daemon');
                    toast.success('Daemon installed and started');
                    setDaemonRunning(true);
                    setDaemonInstalled(true);
                  } catch (e: any) {
                    toast.error(`Failed: ${e}`);
                  } finally {
                    setInstallingDaemon(false);
                  }
                }}
                style={{
                  background: 'rgba(52, 211, 153, 0.15)', border: '1px solid rgba(52, 211, 153, 0.2)',
                  borderRadius: 6, cursor: 'pointer', padding: '6px 12px',
                  fontSize: 12, fontWeight: 600, color: '#34d399',
                }}
              >
                {installingDaemon ? 'Setting up...' : !daemonInstalled ? 'Set Up' : 'Restart'}
              </button>
            </div>
          )}

          {/* Watch detection banner */}
          {linkedWatches.length > 0 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 14px',
              borderRadius: 10,
              background: 'linear-gradient(135deg, rgba(52, 211, 153, 0.1), rgba(52, 211, 153, 0.05))',
              border: '1px solid rgba(52, 211, 153, 0.2)',
              marginBottom: 12,
            }}>
              <span style={{ fontSize: 22 }}>⌚</span>
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>
                  {linkedWatches.length === 1 ? 'Apple Watch connected' : `${linkedWatches.length} Apple Watches connected`}
                </span>
                <span style={{ display: 'block', fontSize: 11, opacity: 0.6, marginTop: 2 }}>
                  {linkedWatches.map(w => w.label || 'Apple Watch').join(', ')} {linkedWatches.length === 1 ? 'is' : 'are'} syncing with this Mac
                </span>
              </div>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#34d399', boxShadow: '0 0 6px rgba(52, 211, 153, 0.5)' }} />
            </div>
          )}

          {/* Linked devices list */}
          {linkedDevices.length > 0 && relayConnected && (
            <div style={{ marginBottom: 12 }}>
              <span className="settings-page__row-label" style={{ marginBottom: 6, display: 'block' }}>Linked Devices</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {linkedDevices.map(device => (
                  <div key={device.device_id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: 'var(--color-bg-muted, #f5f5f5)',
                    fontSize: 13,
                  }}>
                    <span style={{ fontSize: 16 }}>
                      {device.device_type === 'watch' ? '⌚' : device.device_type === 'mac' ? '💻' : '📱'}
                    </span>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontWeight: 500 }}>{device.label || device.device_type}</span>
                      {device.lan_ip && (
                        <span style={{ display: 'block', fontSize: 11, opacity: 0.5, fontFamily: 'monospace' }}>
                          {device.lan_ip}
                        </span>
                      )}
                    </div>
                    <span style={{
                      fontSize: 10,
                      padding: '2px 6px',
                      borderRadius: 4,
                      background: device.device_type === 'watch' ? 'rgba(52, 211, 153, 0.15)' : 'rgba(0,0,0,0.06)',
                      color: device.device_type === 'watch' ? '#34d399' : 'inherit',
                      fontWeight: 500,
                    }}>
                      {device.device_type}
                    </span>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        const name = device.label || device.device_type;
                        if (!window.confirm(`Unlink "${name}"? This device will lose access to your synced projects.`)) return;
                        try {
                          await invoke('relay_unlink_device', { deviceId: device.device_id });
                          toast.success(`${name} unlinked`);
                          await refreshLinkedDevices();
                        } catch (err: any) {
                          toast.error(`Failed to unlink: ${err}`);
                        }
                      }}
                      style={{
                        background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
                        borderRadius: 4, cursor: 'pointer',
                        fontSize: 11, padding: '3px 8px',
                        color: '#ef4444', fontWeight: 500,
                      }}
                      title={`Unlink ${device.label || device.device_type}`}
                    >
                      Unlink
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="settings-page__row">
            <div>
              <span className="settings-page__row-label">
                Connection Status
                <span className={`settings-page__relay-dot ${relayConnected ? 'settings-page__relay-dot--connected' : ''}`} />
              </span>
              <span className="settings-page__row-desc">
                {relayConnected ? relayUrl : 'Not connected to relay'}
              </span>
            </div>
          </div>
          {!relayConnected && (
            <div className="settings-page__relay-link">
              <Button
                variant="primary"
                size="lg"
                style={{ width: '100%', backgroundColor: '#000', color: '#fff', borderColor: '#333', marginBottom: 12 }}
                onClick={() => invoke('relay_sign_in_with_apple_web')}
              >
                Sign in with Apple
              </Button>
              <p className="settings-page__section-desc" style={{ textAlign: 'center', marginBottom: 12 }}>
                — or link with a code from your Apple Watch —
              </p>
              <div className="settings-page__relay-code-row">
                <input
                  type="text"
                  className="settings-page__relay-input"
                  placeholder="XXXXXX"
                  maxLength={6}
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  value={linkCodeInput}
                  onChange={(e) => setLinkCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                />
                <Button
                  variant="primary"
                  size="md"
                  icon={link2}
                  disabled={linkCodeInput.length !== 6 || relayLoading}
                  onClick={async () => {
                    setRelayLoading(true);
                    try {
                      await invoke('relay_redeem_link_code', { code: linkCodeInput });
                      setLinkCodeInput('');
                      await refreshRelayStatus();
                      toast.success('Linked to relay successfully');
                    } catch (e) {
                      toast.error(`Link failed: ${e}`);
                    } finally {
                      setRelayLoading(false);
                    }
                  }}
                >
                  {relayLoading ? 'Linking...' : 'Link'}
                </Button>
              </div>
            </div>
          )}
          {relayConnected && (
            <div className="settings-page__relay-link">
              <div className="settings-page__row">
                <div style={{ flex: 1 }}>
                  <span className="settings-page__row-label">Workspace Name</span>
                  <span className="settings-page__row-desc">
                    Label this Mac so you can switch between workspaces on your watch.
                  </span>
                </div>
                <div className="settings-page__relay-code-row">
                  <input
                    type="text"
                    className="settings-page__relay-input"
                    placeholder="e.g. Work, Personal"
                    maxLength={32}
                    value={workspaceLabelDraft}
                    onChange={(e) => setWorkspaceLabelDraft(e.target.value)}
                    style={{ fontSize: 13, letterSpacing: 'normal', textAlign: 'left', width: 180, fontFamily: 'inherit' }}
                  />
                  <Button
                    variant="primary"
                    size="md"
                    disabled={
                      workspaceLabelDraft.trim() === '' ||
                      workspaceLabelDraft.trim() === workspaceLabel
                    }
                    onClick={async () => {
                      try {
                        await invoke('relay_set_workspace_label', { label: workspaceLabelDraft.trim() });
                        setWorkspaceLabel(workspaceLabelDraft.trim());
                        toast.success('Workspace name updated');
                      } catch (e) {
                        toast.error(`Failed: ${e}`);
                      }
                    }}
                  >
                    Save
                  </Button>
                </div>
              </div>
              <div className="settings-page__row">
                <div>
                  <span className="settings-page__row-label">Link Another Device</span>
                  <span className="settings-page__row-desc">
                    Generate a code to link another Mac or device to this account.
                  </span>
                </div>
                <Button
                  variant="secondary"
                  size="md"
                  icon={watch}
                  disabled={relayLoading}
                  onClick={async () => {
                    setRelayLoading(true);
                    try {
                      const result = await invoke<{ code: string }>('relay_generate_link_code');
                      setGeneratedCode(result.code);
                    } catch (e) {
                      toast.error(`Failed: ${e}`);
                    } finally {
                      setRelayLoading(false);
                    }
                  }}
                >
                  Generate Code
                </Button>
              </div>
              {generatedCode && (
                <div className="settings-page__relay-generated">
                  <span className="settings-page__relay-generated-label">Enter this code on your other device:</span>
                  <code className="settings-page__relay-generated-code">{generatedCode}</code>
                </div>
              )}
              <div className="settings-page__row">
                <div>
                  <span className="settings-page__row-label">Re-link with New Code</span>
                  <span className="settings-page__row-desc">
                    Replace this Mac's connection by entering a fresh code from your watch.
                  </span>
                </div>
                <Button
                  variant="secondary"
                  size="md"
                  icon={link2}
                  onClick={async () => {
                    try {
                      await invoke('relay_disconnect');
                      setRelayConnected(false);
                      setGeneratedCode('');
                      setLinkCodeInput('');
                      toast.info('Ready for new code');
                    } catch (e) {
                      toast.error(`Failed: ${e}`);
                    }
                  }}
                >
                  Re-link
                </Button>
              </div>
            </div>
          )}
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
