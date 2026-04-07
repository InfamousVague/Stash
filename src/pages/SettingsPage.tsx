import { Button } from '@base/primitives/button';
import '@base/primitives/button/button.css';
import { Separator } from '@base/primitives/separator';
import '@base/primitives/separator/separator.css';
import { scan } from '@base/primitives/icon/icons/scan';
import { useScanner } from '../hooks/useScanner';
import { ScanBanner } from '../components/ScanBanner';
import './SettingsPage.css';

export function SettingsPage() {
  const { scanning, progress, results, startScan, dismiss } = useScanner();

  return (
    <div className="settings-page">
      {(scanning || progress) && (
        <ScanBanner
          scanning={scanning}
          progress={progress}
          results={results}
          onDismiss={dismiss}
        />
      )}

      <div className="settings-page__content">
        <section className="settings-page__section">
          <h3 className="settings-page__section-title">Scan Directories</h3>
          <p className="settings-page__section-desc">
            Scan your system for .env files to discover new projects and environment variables.
          </p>
          <Button variant="secondary" size="sm" icon={scan} onClick={startScan} disabled={scanning}>
            {scanning ? 'Scanning...' : 'Re-scan'}
          </Button>
        </section>

        <Separator />

        <section className="settings-page__section">
          <h3 className="settings-page__section-title">About</h3>
          <div className="settings-page__about">
            <div className="settings-page__about-row">
              <span className="settings-page__about-label">Version</span>
              <span className="settings-page__about-value">0.1.0</span>
            </div>
            <div className="settings-page__about-row">
              <span className="settings-page__about-label">Runtime</span>
              <span className="settings-page__about-value">Tauri v2</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
