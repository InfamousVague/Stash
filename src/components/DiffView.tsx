import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@base/primitives/button';
import '@base/primitives/button/button.css';
import { Select } from '@base/primitives/select';
import '@base/primitives/select/select.css';
import { InfoGuide } from './InfoGuide';
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
  const { t } = useTranslation();
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
      <div style={{ padding: '0 0 8px' }}>
        <InfoGuide
          storageKey="stash-guide-diff-dismissed"
          titleKey="guide.diff.title"
          stepKeys={['guide.diff.step1', 'guide.diff.step2', 'guide.diff.step3']}
        />
      </div>
      <div className="diff-view__controls">
        <div className="diff-view__select">
          <label className="diff-view__label">{t('diffView.left')}</label>
          <Select size="md" value={left} onChange={(e) => setLeft(e.target.value)}>
            {profiles.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </Select>
        </div>
        <span className="diff-view__vs">{t('diffView.vs')}</span>
        <div className="diff-view__select">
          <label className="diff-view__label">{t('diffView.right')}</label>
          <Select size="md" value={right} onChange={(e) => setRight(e.target.value)}>
            {profiles.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </Select>
        </div>
        <Button variant="ghost" size="md" onClick={runDiff} disabled={loading || left === right}>
          {t('diffView.refresh')}
        </Button>
      </div>

      {left === right && (
        <p className="diff-view__hint">{t('diffView.selectDifferent')}</p>
      )}

      {entries.length > 0 && (
        <>
          <p className="diff-view__summary">
            {changedCount === 0
              ? t('diffView.identical')
              : t('diffView.differences', { count: changedCount })}
          </p>
          <div className="diff-view__table">
            <div className="diff-view__row diff-view__row--header">
              <span className="diff-view__cell diff-view__cell--key">{t('diffView.variable')}</span>
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
                <summary>{t('diffView.unchangedVars', { count: entries.filter((e) => e.status === 'same').length })}</summary>
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
