import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { Input } from '@base/primitives/input';
import '@base/primitives/input/input.css';
import { Button } from '@base/primitives/button';
import '@base/primitives/button/button.css';
import { search } from '@base/primitives/icon/icons/search';
import { plus } from '@base/primitives/icon/icons/plus';
import { x } from '@base/primitives/icon/icons/x';
import { upload } from '@base/primitives/icon/icons/upload';
import { fileDown } from '@base/primitives/icon/icons/file-down';
import { Badge } from '@base/primitives/badge';
import '@base/primitives/badge/badge.css';
import { EnvVarRow } from './EnvVarRow';
import { ImportDialog } from './ImportDialog';
import { getSuggestions } from '../data/framework-suggestions';
import { useToastContext } from '../contexts/ToastContext';
import type { EnvVar, ApiService } from '../types';
import type { SavedKey } from '../hooks/useSavedKeys';
import './EnvEditor.css';

interface EnvEditorProps {
  vars: EnvVar[];
  projectId?: string;
  onUpdate: (key: string, value: string) => void;
  onAdd: (key: string, value: string) => void;
  onDelete: (key: string) => void;
  matchEnvKey: (key: string) => ApiService | null;
  rotation?: Record<string, number>;
  framework?: string | null;
  initialFilter?: string;
  onFilterUsed?: () => void;
  savedKeys?: SavedKey[];
  onSaveKey?: (envKey: string, value: string, service?: ApiService | null) => void;
}

export function EnvEditor({ vars, projectId, onUpdate, onAdd, onDelete, matchEnvKey, rotation, framework, initialFilter, onFilterUsed, savedKeys, onSaveKey }: EnvEditorProps) {
  const { t } = useTranslation();
  const toast = useToastContext();
  const [filter, setFilter] = useState(initialFilter || '');
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [adding, setAdding] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  // Sync external filter (e.g. navigating from Health page)
  useEffect(() => {
    if (initialFilter) {
      setFilter(initialFilter);
      onFilterUsed?.();
    }
  }, [initialFilter, onFilterUsed]);

  const filteredVars = filter.trim()
    ? vars.filter((v) => v.key.toLowerCase().includes(filter.toLowerCase()))
    : vars;

  const handleAdd = () => {
    const key = newKey.trim();
    if (!key) return;
    onAdd(key, newValue);
    setNewKey('');
    setNewValue('');
  };

  const handleCancel = () => {
    setAdding(false);
    setNewKey('');
    setNewValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleAdd();
    if (e.key === 'Escape') handleCancel();
  };

  const focusKeyInput = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      const input = node.querySelector('input');
      input?.focus();
      node.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, []);

  const handleExportExample = async () => {
    if (!projectId) return;
    try {
      await invoke<string>('generate_env_example', { projectId });
      toast.success(t('envEditor.exampleExported'));
    } catch (e) {
      toast.error(String(e));
    }
  };

  const handleImported = (count: number) => {
    toast.success(t('importDialog.imported', { count }));
  };

  const suggestions = showSuggestions ? getSuggestions(framework ?? null, vars.map((v) => v.key)) : [];

  return (
    <div className="env-editor">
      <div className="env-editor__search">
        <Input
          size="md"
          variant="outline"
          iconLeft={search}
          placeholder={t('envEditor.filterPlaceholder')}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <div className="env-editor__toolbar-actions">
          <Button variant="ghost" size="sm" icon={upload} onClick={() => setImportOpen(true)}>
            {t('envEditor.import')}
          </Button>
          {projectId && vars.length > 0 && (
            <Button variant="ghost" size="sm" icon={fileDown} onClick={handleExportExample}>
              {t('envEditor.exportExample')}
            </Button>
          )}
        </div>
      </div>

      <div className="env-editor__list">
        {filteredVars.length === 0 ? (
          <div className="env-editor__empty">
            {vars.length === 0 ? t('envEditor.noVarsYet') : t('envEditor.noMatch')}
          </div>
        ) : (
          filteredVars.map((v) => (
            <EnvVarRow
              key={v.key}
              envKey={v.key}
              value={v.value}
              projectId={projectId}
              matchedService={matchEnvKey(v.key)}
              lastChanged={rotation?.[v.key]}
              onUpdate={onUpdate}
              onDelete={onDelete}
              savedKeys={savedKeys}
              onSaveKey={onSaveKey}
            />
          ))
        )}

        {/* New variable button / inline form — inside the scroll */}
        {adding ? (
          <div className="env-editor__add-inline" ref={focusKeyInput}>
            <div className="env-editor__add-inputs">
              <Input
                size="md"
                variant="outline"
                placeholder="KEY_NAME"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                onKeyDown={handleKeyDown}
                style={{ fontFamily: 'var(--font-mono)', flex: 1, minWidth: 0 }}
              />
              <Input
                size="md"
                variant="outline"
                placeholder="value"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                onKeyDown={handleKeyDown}
                style={{ flex: 2, minWidth: 0 }}
              />
              <Button
                variant="primary"
                size="md"
                icon={plus}
                onClick={handleAdd}
                disabled={!newKey.trim()}
              >
                {t('common.add')}
              </Button>
              <Button
                variant="ghost"
                size="md"
                icon={x}
                iconOnly
                onClick={handleCancel}
                aria-label={t('common.cancel')}
              />
            </div>
            <span className="env-editor__add-hint">
              {t('envEditor.addHint')}
            </span>
          </div>
        ) : (
          <button className="env-editor__new-btn" onClick={() => setAdding(true)}>
            <span className="env-editor__new-btn-icon">+</span>
            {t('envEditor.newVariable')}
          </button>
        )}
      </div>

      {/* Framework suggestions — pinned to bottom, outside scroll */}
      {suggestions.length > 0 && (
        <div className="env-editor__suggestions">
          <div className="env-editor__suggestions-header">
            <span className="env-editor__suggestions-label">{t('envEditor.suggestedFor', { framework })}</span>
            <button className="env-editor__suggestions-close" onClick={() => setShowSuggestions(false)}>×</button>
          </div>
          <div className="env-editor__suggestions-list">
            {suggestions.map((key) => (
              <button
                key={key}
                className="env-editor__suggestion"
                onClick={() => { onAdd(key, ''); }}
              >
                <code>{key}</code>
                <Badge variant="subtle" size="sm" color="accent">{t('envEditor.add')}</Badge>
              </button>
            ))}
          </div>
        </div>
      )}

      {projectId && (
        <ImportDialog
          open={importOpen}
          projectId={projectId}
          onClose={() => setImportOpen(false)}
          onImported={handleImported}
        />
      )}
    </div>
  );
}
