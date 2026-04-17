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
import { clipboardCopy } from '@base/primitives/icon/icons/clipboard-copy';
import { clipboardPaste } from '@base/primitives/icon/icons/clipboard-paste';
import { history as historyIcon } from '@base/primitives/icon/icons/history';
import { alertTriangle } from '@base/primitives/icon/icons/alert-triangle';
import { save } from '@base/primitives/icon/icons/save';
import { send } from '@base/primitives/icon/icons/send';
import { Icon } from '@base/primitives/icon';
import '@base/primitives/icon/icon.css';
import { openUrl } from '@tauri-apps/plugin-opener';
import type { ApiService, Contact, HistoryEntry } from '../types';
import type { SavedKey } from '../hooks/useSavedKeys';
import { formatRelativeTime, getStaleStatus, validateEnvVar, detectServiceFromValue } from '../utils/validation';
import { Tip } from './Tip';
import './EnvVarRow.css';

interface EnvVarRowProps {
  envKey: string;
  value: string;
  projectId?: string;
  matchedService?: ApiService | null;
  lastChanged?: number; // unix timestamp
  onUpdate: (key: string, value: string) => void;
  onDelete: (key: string) => void;
  savedKeys?: SavedKey[];
  onSaveKey?: (envKey: string, value: string, service?: ApiService | null) => void;
}

export function EnvVarRow({ envKey, value, projectId, matchedService, lastChanged, onUpdate, onDelete, savedKeys, onSaveKey }: EnvVarRowProps) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [editing, setEditing] = useState(false);
  const [localValue, setLocalValue] = useState(value);
  const [showHistory, setShowHistory] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const [showSavedKeyPicker, setShowSavedKeyPicker] = useState(false);
  const [showSharePicker, setShowSharePicker] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [sharedContactId, setSharedContactId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);
  const [dotKey, setDotKey] = useState(0);
  const [copied, setCopied] = useState(false);
  const [pasteHint, setPasteHint] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const validationRef = useRef<HTMLSpanElement>(null);
  const savedKeyPickerRef = useRef<HTMLDivElement>(null);
  const sharePickerRef = useRef<HTMLDivElement>(null);

  const openPopoverAt = (el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    setPopoverPos({ top: rect.bottom + 4, left: rect.left });
  };

  // Matching saved keys for this env key
  const matchingSavedKeys = (savedKeys || []).filter((sk) => {
    // Match by exact env_key name
    if (sk.env_key.toUpperCase() === envKey.toUpperCase()) return true;
    // Match by service if we have a matched service
    if (matchedService && sk.service_id === matchedService.id) return true;
    return false;
  });

  // Close popovers on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (showHistory && historyRef.current && !historyRef.current.contains(e.target as Node)) {
        setShowHistory(false);
      }
      if (showValidation && validationRef.current && !validationRef.current.contains(e.target as Node)) {
        setShowValidation(false);
      }
      if (showSavedKeyPicker && savedKeyPickerRef.current && !savedKeyPickerRef.current.contains(e.target as Node)) {
        setShowSavedKeyPicker(false);
      }
      if (showSharePicker && sharePickerRef.current && !sharePickerRef.current.contains(e.target as Node)) {
        setShowSharePicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showHistory, showValidation, showSavedKeyPicker, showSharePicker]);

  const loadHistory = useCallback(async () => {
    if (!projectId) return;
    try {
      const entries = await invoke<HistoryEntry[]>('get_var_history', { projectId, key: envKey });
      setHistory(entries.reverse());
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
      if (pasteTimerRef.current) clearTimeout(pasteTimerRef.current);
    };
  }, []);

  const pasteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text');
    if (!pasted) return;
    const detected = detectServiceFromValue(pasted.trim());
    if (detected) {
      if (pasteTimerRef.current) clearTimeout(pasteTimerRef.current);
      setPasteHint(detected);
      pasteTimerRef.current = setTimeout(() => setPasteHint(null), 5000);
    }
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(localValue);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  const handleUseSavedKey = (sk: SavedKey) => {
    setLocalValue(sk.value);
    onUpdate(envKey, sk.value);
    setShowSavedKeyPicker(false);
  };

  const handleOpenSharePicker = async (el: HTMLElement) => {
    openPopoverAt(el);
    try {
      const list = await invoke<Contact[]>('list_contacts');
      setContacts(list);
    } catch {
      setContacts([]);
    }
    setSharedContactId(null);
    setShowSharePicker(true);
  };

  const handleShareWithContact = async (contact: Contact) => {
    try {
      const link = await invoke<string>('encrypt_for_person', {
        key: envKey,
        value: localValue,
        recipientPublicKey: contact.public_key,
      });
      await navigator.clipboard.writeText(link);
      setSharedContactId(contact.public_key);
      setTimeout(() => {
        setSharedContactId(null);
        setShowSharePicker(false);
      }, 1500);
    } catch { /* ignore */ }
  };

  const showGetKey = matchedService && !value.trim();
  const stale = getStaleStatus(lastChanged);
  const validationWarning = validateEnvVar(envKey, localValue);
  const hasSavedValue = matchingSavedKeys.length > 0;
  const isAlreadySaved = matchingSavedKeys.some((sk) => sk.value === localValue && localValue !== '');

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
        {projectId && (
          <div className="env-var-row__history-wrapper" ref={historyRef}>
            <Tip content={t('envVarRow.history')}>
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                icon={historyIcon}
                onClick={(e) => {
                  if (showHistory) { setShowHistory(false); } else {
                    openPopoverAt(e.currentTarget as HTMLElement);
                    loadHistory();
                  }
                }}
                aria-label={t('envVarRow.history')}
              />
            </Tip>
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
            onPaste={handlePaste}
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
              aria-label={t('envVarRow.validationWarning')}
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

        {/* Saved key picker — show when value is empty and there are matching saved keys */}
        {hasSavedValue && !localValue && (
          <div className="env-var-row__saved-wrapper" ref={savedKeyPickerRef}>
            <Button
              variant="secondary"
              size="md"
              icon={clipboardPaste}
              onClick={(e) => {
                if (matchingSavedKeys.length === 1) {
                  handleUseSavedKey(matchingSavedKeys[0]);
                } else {
                  openPopoverAt(e.currentTarget as HTMLElement);
                  setShowSavedKeyPicker(!showSavedKeyPicker);
                }
              }}
            >
              {t('envVarRow.useSaved')}
            </Button>
            {showSavedKeyPicker && popoverPos && matchingSavedKeys.length > 1 && (
              <div className="env-var-row__saved-popover" style={{ top: popoverPos.top, left: popoverPos.left }}>
                <div className="env-var-row__saved-popover-header">{t('envVarRow.selectSavedKey')}</div>
                {matchingSavedKeys.map((sk) => (
                  <button
                    key={sk.id}
                    className="env-var-row__saved-option"
                    onClick={() => handleUseSavedKey(sk)}
                  >
                    <span className="env-var-row__saved-option-service">{sk.service_name}</span>
                    <code className="env-var-row__saved-option-key">{sk.env_key}</code>
                    {sk.notes && <span className="env-var-row__saved-option-notes">{sk.notes}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <Tip content={copied ? t('envVarRow.copied') : t('envVarRow.copy')}>
          <Button
            variant="ghost"
            size="md"
            iconOnly
            icon={clipboardCopy}
            onClick={handleCopy}
            aria-label={copied ? t('envVarRow.copied') : t('envVarRow.copy')}
            disabled={!localValue}
            className={copied ? 'env-var-row__copied' : ''}
          />
        </Tip>
        <Tip content={visible ? t('envVarRow.hide') : t('envVarRow.reveal')}>
          <Button
            variant="ghost"
            size="md"
            iconOnly
            icon={visible ? eyeOff : eye}
            onClick={() => setVisible(!visible)}
            aria-label={visible ? t('envVarRow.hide') : t('envVarRow.reveal')}
          />
        </Tip>
        {/* Share with contact */}
        {localValue && (
          <div className="env-var-row__share-wrapper" ref={sharePickerRef}>
            <Tip content={t('envVarRow.share')}>
              <Button
                variant="ghost"
                size="md"
                iconOnly
                icon={send}
                onClick={(e) => {
                  if (showSharePicker) {
                    setShowSharePicker(false);
                  } else {
                    handleOpenSharePicker(e.currentTarget as HTMLElement);
                  }
                }}
                aria-label={t('envVarRow.share')}
              />
            </Tip>
            {showSharePicker && popoverPos && (
              <div className="env-var-row__share-popover" style={{ top: popoverPos.top, left: popoverPos.left }}>
                <div className="env-var-row__share-popover-header">{t('envVarRow.shareWith')}</div>
                {contacts.length === 0 ? (
                  <div className="env-var-row__share-empty">{t('envVarRow.noContacts')}</div>
                ) : (
                  <div className="env-var-row__share-list">
                    {contacts.map((contact) => (
                      <button
                        key={contact.public_key}
                        className="env-var-row__share-option"
                        onClick={() => handleShareWithContact(contact)}
                        disabled={sharedContactId === contact.public_key}
                      >
                        {sharedContactId === contact.public_key ? (
                          <span className="env-var-row__share-success">{t('envVarRow.linkCopied')}</span>
                        ) : (
                          <>
                            <span className="env-var-row__share-option-name">{contact.name}</span>
                            <code className="env-var-row__share-option-key">{contact.public_key.slice(0, 12)}...</code>
                          </>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {/* Save to saved keys */}
        {onSaveKey && localValue && !isAlreadySaved && (
          <Tip content={t('envVarRow.saveKey')}>
            <Button
              variant="ghost"
              size="md"
              iconOnly
              icon={save}
              onClick={() => onSaveKey(envKey, localValue, matchedService)}
              aria-label={t('envVarRow.saveKey')}
            />
          </Tip>
        )}
        <Tip content={t('envVarRow.delete')}>
          <Button
            variant="ghost"
            size="md"
            iconOnly
            icon={trash2}
            onClick={() => onDelete(envKey)}
            aria-label={t('envVarRow.delete')}
          />
        </Tip>
        {showGetKey && !hasSavedValue && (
          <Button
            variant="secondary"
            size="md"
            onClick={() => openUrl(matchedService.portalUrl)}
          >
            {t('envVarRow.getKey')}
          </Button>
        )}
      </div>
      {pasteHint && (
        <div className="env-var-row__paste-hint">
          <Badge variant="subtle" size="sm" color="info">
            {t('envVarRow.detectedService', { service: pasteHint })}
          </Badge>
          {onSaveKey && (
            <button
              className="env-var-row__paste-save"
              onClick={() => { onSaveKey(envKey, localValue, matchedService); setPasteHint(null); }}
            >
              {t('envVarRow.saveKey')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
