import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@base/primitives/button';
import '@base/primitives/button/button.css';
import { Checkbox } from '@base/primitives/checkbox';
import '@base/primitives/checkbox/checkbox.css';
import { Separator } from '@base/primitives/separator';
import '@base/primitives/separator/separator.css';
import stashIcon from '../assets/stash-icon.png';
import './SetupWizard.css';

interface SetupWizardProps {
  onComplete: () => void;
}

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const [directories, setDirectories] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [installCli, setInstallCli] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    invoke<string[]>('get_suggested_directories').then((dirs) => {
      setDirectories(dirs);
      // Pre-select common dev directories
      const devNames = ['Development', 'Projects', 'code', 'repos', 'work', 'src'];
      const preselected = new Set(
        dirs.filter((d) => devNames.some((name) => d.endsWith(`/${name}`)))
      );
      setSelected(preselected);
    }).catch(() => {});
  }, []);

  const toggleDir = (dir: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(dir)) {
        next.delete(dir);
      } else {
        next.add(dir);
      }
      return next;
    });
  };

  const handleComplete = async () => {
    setSaving(true);
    try {
      await invoke('complete_setup', { scanDirectories: Array.from(selected) });
      if (installCli) {
        try {
          await invoke('install_cli');
        } catch {
          // CLI install may fail (needs sudo), non-blocking
        }
      }
      onComplete();
    } catch (e) {
      console.error('Setup failed:', e);
    } finally {
      setSaving(false);
    }
  };

  const dirName = (path: string) => path.split('/').pop() || path;

  return (
    <div className="setup-wizard">
      <div className="setup-wizard__card">
        <img src={stashIcon} alt="Stash" className="setup-wizard__icon" />
        <h1 className="setup-wizard__title">Welcome to Stash</h1>
        <p className="setup-wizard__desc">
          Choose which directories to scan for .env files.
        </p>

        <div className="setup-wizard__dirs">
          {directories.map((dir) => (
            <label key={dir} className="setup-wizard__dir" onClick={() => toggleDir(dir)}>
              <Checkbox
                checked={selected.has(dir)}
                onChange={() => toggleDir(dir)}
              />
              <span className="setup-wizard__dir-name">{dirName(dir)}</span>
              <span className="setup-wizard__dir-path">{dir}</span>
            </label>
          ))}
        </div>

        {directories.length === 0 && (
          <p className="setup-wizard__hint">Loading directories...</p>
        )}

        <Separator />

        <label className="setup-wizard__option" onClick={() => setInstallCli(!installCli)}>
          <Checkbox checked={installCli} onChange={() => setInstallCli(!installCli)} />
          <div>
            <span className="setup-wizard__option-label">Install CLI tool</span>
            <span className="setup-wizard__option-desc">Adds `stash` command to /usr/local/bin</span>
          </div>
        </label>

        <Button
          variant="primary"
          size="md"
          onClick={handleComplete}
          disabled={selected.size === 0 || saving}
        >
          {saving ? 'Setting up...' : `Get Started (${selected.size} directories)`}
        </Button>
      </div>
    </div>
  );
}
