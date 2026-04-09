import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@base/primitives/input';
import '@base/primitives/input/input.css';
import { Button } from '@base/primitives/button';
import '@base/primitives/button/button.css';
import { Badge } from '@base/primitives/badge';
import '@base/primitives/badge/badge.css';
import { invoke } from '@tauri-apps/api/core';
import { eye } from '@base/primitives/icon/icons/eye';
import { eyeOff } from '@base/primitives/icon/icons/eye-off';
import { trash2 } from '@base/primitives/icon/icons/trash-2';
import { calendar } from '@base/primitives/icon/icons/calendar';
import { clock } from '@base/primitives/icon/icons/clock';
import { alertTriangle } from '@base/primitives/icon/icons/alert-triangle';
import { Icon } from '@base/primitives/icon';
import '@base/primitives/icon/icon.css';
import { openUrl } from '@tauri-apps/plugin-opener';
import type { ApiService, HistoryEntry } from '../types';
import './EnvVarRow.css';

interface EnvVarRowProps {
  envKey: string;
  value: string;
  projectId?: string;
  matchedService?: ApiService | null;
  lastChanged?: number; // unix timestamp
  expiryDate?: number; // unix timestamp
  onUpdate: (key: string, value: string) => void;
  onDelete: (key: string) => void;
  onSetExpiry?: (key: string, timestamp: number | null) => void;
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now() / 1000;
  const diff = now - timestamp;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(timestamp * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getStaleStatus(lastChanged?: number): 'fresh' | 'aging' | 'stale' | 'unknown' {
  if (!lastChanged) return 'unknown';
  const now = Date.now() / 1000;
  const days = (now - lastChanged) / 86400;
  if (days > 90) return 'stale';
  if (days > 30) return 'aging';
  return 'fresh';
}

function getExpiryLabel(expiryDate?: number): { label: string; color: 'error' | 'warning' | 'neutral' } | null {
  if (!expiryDate) return null;
  const now = Date.now() / 1000;
  const daysUntil = Math.ceil((expiryDate - now) / 86400);
  const date = new Date(expiryDate * 1000);
  const formatted = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (daysUntil <= 0) return { label: `Expired ${formatted}`, color: 'error' };
  if (daysUntil <= 7) return { label: `Expires ${formatted}`, color: 'warning' };
  return { label: `Expires ${formatted}`, color: 'neutral' };
}

function validateEnvVar(key: string, value: string): string | null {
  if (!value) return null;
  const upper = key.toUpperCase();

  if (value !== value.trimEnd()) return 'Value has trailing whitespace';

  if (upper.includes('AWS_ACCESS_KEY')) {
    if (!value.startsWith('AKIA') || value.length !== 20)
      return 'AWS access keys should start with AKIA and be 20 characters';
  }
  if (upper.startsWith('STRIPE_') && (upper.includes('KEY') || upper.includes('SECRET'))) {
    const prefixes = ['sk_live_', 'sk_test_', 'pk_live_', 'pk_test_', 'rk_live_', 'rk_test_'];
    if (!prefixes.some(p => value.startsWith(p)))
      return 'Stripe keys should start with sk_live_, sk_test_, pk_live_, or pk_test_';
  }
  if (upper.includes('GITHUB_TOKEN') || upper.includes('GH_TOKEN')) {
    const prefixes = ['ghp_', 'gho_', 'ghs_', 'github_pat_'];
    if (!prefixes.some(p => value.startsWith(p)))
      return 'GitHub tokens should start with ghp_, gho_, ghs_, or github_pat_';
  }
  if (upper.endsWith('_URL') || upper.endsWith('_URI')) {
    if (!value.includes('://'))
      return 'URL values should include a protocol (e.g. https://, postgres://)';
  }
  if (upper.endsWith('_PORT')) {
    const port = parseInt(value, 10);
    if (isNaN(port) || port < 1 || port > 65535)
      return 'Port should be a number between 1 and 65535';
  }
  return null;
}

function timestampToDateInput(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toISOString().split('T')[0];
}

export function EnvVarRow({ envKey, value, projectId, matchedService, lastChanged, expiryDate, onUpdate, onDelete, onSetExpiry }: EnvVarRowProps) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [editing, setEditing] = useState(false);
  const [localValue, setLocalValue] = useState(value);
  const [showExpiryPicker, setShowExpiryPicker] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);
  const [dotKey, setDotKey] = useState(0); // for re-triggering dot animation
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const expiryRef = useRef<HTMLDivElement>(null);
  const validationRef = useRef<HTMLSpanElement>(null);

  const openPopoverAt = (el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    setPopoverPos({ top: rect.bottom + 4, left: rect.left });
  };

  // Close popovers on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (showHistory && historyRef.current && !historyRef.current.contains(e.target as Node)) {
        setShowHistory(false);
      }
      if (showExpiryPicker && expiryRef.current && !expiryRef.current.contains(e.target as Node)) {
        setShowExpiryPicker(false);
      }
      if (showValidation && validationRef.current && !validationRef.current.contains(e.target as Node)) {
        setShowValidation(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showHistory, showExpiryPicker, showValidation]);

  const loadHistory = useCallback(async () => {
    if (!projectId) return;
    try {
      const entries = await invoke<HistoryEntry[]>('get_var_history', { projectId, key: envKey });
      setHistory(entries.reverse()); // newest first
      setShowHistory(true);
    } catch {
      setHistory([]);
      setShowHistory(true);
    }
  }, [projectId, envKey]);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newVal = e.target.value;
      setLocalValue(newVal);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onUpdate(envKey, newVal);
      }, 500);
    },
    [envKey, onUpdate]
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const showGetKey = matchedService && !value.trim();
  const stale = getStaleStatus(lastChanged);
  const expiryLabel = getExpiryLabel(expiryDate);
  const validationWarning = validateEnvVar(envKey, localValue);

  return (
    <div className="env-var-row">
      <div className="env-var-row__key">
        <code>{envKey}</code>
        {matchedService && (
          <Badge variant="subtle" size="sm" color="accent">
            {matchedService.name}
          </Badge>
        )}
        {stale === 'stale' && (
          <Badge variant="subtle" size="sm" color="error">{t('envVarRow.stale90d')}</Badge>
        )}
        {stale === 'aging' && (
          <Badge variant="subtle" size="sm" color="warning">{t('envVarRow.aging30d')}</Badge>
        )}
        {expiryLabel && (
          <Badge variant="subtle" size="sm" color={expiryLabel.color}>
            {expiryLabel.label}
          </Badge>
        )}
        {projectId && (
          <div className="env-var-row__history-wrapper" ref={historyRef}>
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              icon={clock}
              onClick={(e) => {
                if (showHistory) { setShowHistory(false); } else {
                  openPopoverAt(e.currentTarget as HTMLElement);
                  loadHistory();
                }
              }}
              aria-label="View history"
            />
            {showHistory && popoverPos && (
              <div className="env-var-row__history-popover" style={{ top: popoverPos.top, left: popoverPos.left }}>
                <div className="env-var-row__history-header">
                  {t('envVarRow.historyFor')} <code>{envKey}</code>
                </div>
                {history.length === 0 ? (
                  <div className="env-var-row__history-empty">{t('envVarRow.noHistory')}</div>
                ) : (
                  <div className="env-var-row__history-list">
                    {history.map((entry, i) => (
                      <div key={i} className="env-var-row__history-entry">
                        <div className="env-var-row__history-meta">
                          <span className="env-var-row__history-time">{formatRelativeTime(entry.timestamp)}</span>
                          <Badge variant="subtle" size="sm" color={
                            entry.action === 'created' ? 'success' :
                            entry.action === 'deleted' ? 'error' : 'accent'
                          }>
                            {entry.action}
                          </Badge>
                        </div>
                        {entry.action === 'updated' && (
                          <div className="env-var-row__history-values">
                            <code>{historyVisible ? (entry.old_value ?? '') : '••••'}</code>
                            <span> → </span>
                            <code>{historyVisible ? (entry.new_value ?? '') : '••••'}</code>
                          </div>
                        )}
                        {entry.action === 'created' && entry.new_value && (
                          <div className="env-var-row__history-values">
                            <code>{historyVisible ? entry.new_value : '••••'}</code>
                          </div>
                        )}
                        {entry.action !== 'created' && entry.old_value && (
                          <button
                            className="env-var-row__history-restore"
                            onClick={() => {
                              onUpdate(envKey, entry.old_value!);
                              setShowHistory(false);
                            }}
                          >
                            {t('envVarRow.restore')}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <div className="env-var-row__history-footer">
                  <button
                    className="env-var-row__history-toggle-vis"
                    onClick={() => setHistoryVisible(!historyVisible)}
                  >
                    {historyVisible ? t('envVarRow.hideValues') : t('envVarRow.showValues')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="env-var-row__value">
        {/* Show animated dots when hidden & not editing */}
        {!visible && !editing && localValue ? (
          <div
            key={dotKey}
            className="env-var-row__masked-dots"
            onClick={() => setEditing(true)}
          >
            {Array.from({ length: Math.min(localValue.length, 24) }).map((_, i) => (
              <span
                key={i}
                className="env-var-row__masked-dot"
                style={{ animationDelay: `${i * 15}ms` }}
              />
            ))}
          </div>
        ) : (
          <Input
            size="md"
            variant="ghost"
            type={visible ? 'text' : 'password'}
            value={localValue}
            onChange={handleChange}
            onFocus={() => setEditing(true)}
            onBlur={() => { setEditing(false); setDotKey((k) => k + 1); }}
            placeholder={t('envVarRow.valuePlaceholder')}
            style={{ fontFamily: 'var(--font-mono)', flex: 1 }}
            autoFocus={editing && !visible}
          />
        )}
        {validationWarning && (
          <span className="env-var-row__validation" ref={validationRef}>
            <button
              className="env-var-row__validation-btn"
              onClick={(e) => {
                if (showValidation) { setShowValidation(false); } else {
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  setPopoverPos({ top: rect.bottom + 6, left: rect.right });
                  setShowValidation(true);
                }
              }}
              aria-label="Validation warning"
            >
              <Icon icon={alertTriangle} size="sm" color="currentColor" />
            </button>
            {showValidation && popoverPos && (
              <div className="env-var-row__validation-tooltip" style={{ top: popoverPos.top, left: popoverPos.left }}>
                {validationWarning}
              </div>
            )}
          </span>
        )}
        <Button
          variant="ghost"
          size="md"
          iconOnly
          icon={visible ? eyeOff : eye}
          onClick={() => setVisible(!visible)}
          aria-label={visible ? 'Hide value' : 'Show value'}
        />
        <Button
          variant="ghost"
          size="md"
          iconOnly
          icon={trash2}
          onClick={() => onDelete(envKey)}
          aria-label="Delete variable"
        />
        {onSetExpiry && (
          <div className="env-var-row__expiry-wrapper" ref={expiryRef}>
            <Button
              variant="ghost"
              size="md"
              iconOnly
              icon={calendar}
              onClick={(e) => {
                if (showExpiryPicker) { setShowExpiryPicker(false); } else {
                  openPopoverAt(e.currentTarget as HTMLElement);
                  setShowExpiryPicker(true);
                }
              }}
              aria-label="Set expiry date"
            />
            {showExpiryPicker && popoverPos && (
              <div className="env-var-row__expiry-popover" style={{ top: popoverPos.top, left: popoverPos.left }}>
                <input
                  type="date"
                  className="env-var-row__expiry-input"
                  value={expiryDate ? timestampToDateInput(expiryDate) : ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val) {
                      const ts = Math.floor(new Date(val + 'T00:00:00').getTime() / 1000);
                      onSetExpiry(envKey, ts);
                    }
                    setShowExpiryPicker(false);
                  }}
                />
                {expiryDate && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      onSetExpiry(envKey, null);
                      setShowExpiryPicker(false);
                    }}
                  >
                    {t('envVarRow.clear')}
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
        {showGetKey && (
          <Button
            variant="secondary"
            size="md"
            onClick={() => openUrl(matchedService.portalUrl)}
          >
            {t('envVarRow.getKey')}
          </Button>
        )}
      </div>
    </div>
  );
}
