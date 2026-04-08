import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@base/primitives/button';
import '@base/primitives/button/button.css';
import { Select } from '@base/primitives/select';
import '@base/primitives/select/select.css';
import './DiffView.css';

interface DiffEntry {
  key: string;
  left_value: string | null;
  right_value: string | null;
  status: string;
}

interface DiffViewProps {
  projectId: string;
  profiles: string[];
}

export function DiffView({ projectId, profiles }: DiffViewProps) {
  const [left, setLeft] = useState(profiles[0] || '');
  const [right, setRight] = useState(profiles[1] || profiles[0] || '');
  const [entries, setEntries] = useState<DiffEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const runDiff = async () => {
    if (!left || !right || left === right) return;
    setLoading(true);
    try {
      const result = await invoke<DiffEntry[]>('diff_profiles', {
        projectId,
        leftProfile: left,
        rightProfile: right,
      });
      setEntries(result);
    } catch (e) {
      console.error('Diff failed:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (left && right && left !== right) runDiff();
  }, [left, right]);

  const changedCount = entries.filter((e) => e.status !== 'same').length;

  return (
    <div className="diff-view">
      <div className="diff-view__controls">
        <div className="diff-view__select">
          <label className="diff-view__label">Left</label>
          <Select size="md" value={left} onChange={(e) => setLeft(e.target.value)}>
            {profiles.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </Select>
        </div>
        <span className="diff-view__vs">vs</span>
        <div className="diff-view__select">
          <label className="diff-view__label">Right</label>
          <Select size="md" value={right} onChange={(e) => setRight(e.target.value)}>
            {profiles.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </Select>
        </div>
        <Button variant="ghost" size="md" onClick={runDiff} disabled={loading || left === right}>
          Refresh
        </Button>
      </div>

      {left === right && (
        <p className="diff-view__hint">Select two different profiles to compare.</p>
      )}

      {entries.length > 0 && (
        <>
          <p className="diff-view__summary">
            {changedCount === 0
              ? 'Profiles are identical.'
              : `${changedCount} difference${changedCount !== 1 ? 's' : ''} found.`}
          </p>
          <div className="diff-view__table">
            <div className="diff-view__row diff-view__row--header">
              <span className="diff-view__cell diff-view__cell--key">Variable</span>
              <span className="diff-view__cell">{left}</span>
              <span className="diff-view__cell">{right}</span>
            </div>
            {entries.filter((e) => e.status !== 'same').map((entry) => (
              <div key={entry.key} className={`diff-view__row diff-view__row--${entry.status}`}>
                <span className="diff-view__cell diff-view__cell--key">
                  <code>{entry.key}</code>
                </span>
                <span className="diff-view__cell diff-view__cell--value">
                  {entry.left_value ?? <em className="diff-view__missing">—</em>}
                </span>
                <span className="diff-view__cell diff-view__cell--value">
                  {entry.right_value ?? <em className="diff-view__missing">—</em>}
                </span>
              </div>
            ))}
            {entries.filter((e) => e.status === 'same').length > 0 && (
              <details className="diff-view__unchanged">
                <summary>{entries.filter((e) => e.status === 'same').length} unchanged variables</summary>
                {entries.filter((e) => e.status === 'same').map((entry) => (
                  <div key={entry.key} className="diff-view__row diff-view__row--same">
                    <span className="diff-view__cell diff-view__cell--key">
                      <code>{entry.key}</code>
                    </span>
                    <span className="diff-view__cell diff-view__cell--value">{entry.left_value}</span>
                    <span className="diff-view__cell diff-view__cell--value">{entry.right_value}</span>
                  </div>
                ))}
              </details>
            )}
          </div>
        </>
      )}
    </div>
  );
}
