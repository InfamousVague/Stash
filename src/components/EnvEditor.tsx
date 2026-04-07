import { useState } from 'react';
import { Input } from '@base/primitives/input';
import '@base/primitives/input/input.css';
import { Button } from '@base/primitives/button';
import '@base/primitives/button/button.css';
import { search } from '@base/primitives/icon/icons/search';
import { plus } from '@base/primitives/icon/icons/plus';
import { EnvVarRow } from './EnvVarRow';
import type { EnvVar, ApiService } from '../types';
import './EnvEditor.css';

interface EnvEditorProps {
  vars: EnvVar[];
  onUpdate: (key: string, value: string) => void;
  onAdd: (key: string, value: string) => void;
  onDelete: (key: string) => void;
  matchEnvKey: (key: string) => ApiService | null;
}

export function EnvEditor({ vars, onUpdate, onAdd, onDelete, matchEnvKey }: EnvEditorProps) {
  const [filter, setFilter] = useState('');
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');

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
          size="sm"
          variant="outline"
          iconLeft={search}
          placeholder="Filter variables..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      <div className="env-editor__list">
        {filteredVars.length === 0 ? (
          <div className="env-editor__empty">
            {vars.length === 0
              ? 'No environment variables yet.'
              : 'No variables match your filter.'}
          </div>
        ) : (
          filteredVars.map((v) => (
            <EnvVarRow
              key={v.key}
              envKey={v.key}
              value={v.value}
              matchedService={matchEnvKey(v.key)}
              onUpdate={onUpdate}
              onDelete={onDelete}
            />
          ))
        )}
      </div>

      <div className="env-editor__add">
        <Input
          size="sm"
          variant="outline"
          placeholder="KEY_NAME"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          onKeyDown={handleKeyDown}
          style={{ fontFamily: 'var(--font-mono)', flex: 1 }}
        />
        <Input
          size="sm"
          variant="outline"
          placeholder="value"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          onKeyDown={handleKeyDown}
          style={{ flex: 2 }}
        />
        <Button
          variant="secondary"
          size="sm"
          icon={plus}
          onClick={handleAdd}
          disabled={!newKey.trim()}
        >
          Add
        </Button>
      </div>
    </div>
  );
}
