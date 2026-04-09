import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@base/primitives/input';
import '@base/primitives/input/input.css';
import { Button } from '@base/primitives/button';
import '@base/primitives/button/button.css';
import { search } from '@base/primitives/icon/icons/search';
import { plus } from '@base/primitives/icon/icons/plus';
import { Badge } from '@base/primitives/badge';
import '@base/primitives/badge/badge.css';
import { EnvVarRow } from './EnvVarRow';
import { getSuggestions } from '../data/framework-suggestions';
import type { EnvVar, ApiService } from '../types';
import './EnvEditor.css';

interface EnvEditorProps {
  vars: EnvVar[];
  projectId?: string;
  onUpdate: (key: string, value: string) => void;
  onAdd: (key: string, value: string) => void;
  onDelete: (key: string) => void;
  matchEnvKey: (key: string) => ApiService | null;
  rotation?: Record<string, number>;
  expiry?: Record<string, number>;
  onSetExpiry?: (key: string, timestamp: number | null) => void;
  framework?: string | null;
}

export function EnvEditor({ vars, projectId, onUpdate, onAdd, onDelete, matchEnvKey, rotation, expiry, onSetExpiry, framework }: EnvEditorProps) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState('');
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(true);

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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleAdd();
  };

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
              expiryDate={expiry?.[v.key]}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onSetExpiry={onSetExpiry}
            />
          ))
        )}
      </div>

      {/* Framework suggestions */}
      {showSuggestions && (() => {
        const suggestions = getSuggestions(framework ?? null, vars.map((v) => v.key));
        if (suggestions.length === 0) return null;
        return (
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
        );
      })()}

      <div className="env-editor__add">
        <span className="env-editor__add-label">{t('envEditor.addVariable')}</span>
        <div className="env-editor__add-row">
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
          variant="secondary"
          size="md"
          icon={plus}
          onClick={handleAdd}
          disabled={!newKey.trim()}
        >
          Add
        </Button>
        </div>
      </div>
    </div>
  );
}
