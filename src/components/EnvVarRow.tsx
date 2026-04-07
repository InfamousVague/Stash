import { useState, useCallback, useRef, useEffect } from 'react';
import { Input } from '@base/primitives/input';
import '@base/primitives/input/input.css';
import { Button } from '@base/primitives/button';
import '@base/primitives/button/button.css';
import { Badge } from '@base/primitives/badge';
import '@base/primitives/badge/badge.css';
import { eye } from '@base/primitives/icon/icons/eye';
import { eyeOff } from '@base/primitives/icon/icons/eye-off';
import { trash2 } from '@base/primitives/icon/icons/trash-2';
import { openUrl } from '@tauri-apps/plugin-opener';
import type { ApiService } from '../types';
import './EnvVarRow.css';

interface EnvVarRowProps {
  envKey: string;
  value: string;
  matchedService?: ApiService | null;
  onUpdate: (key: string, value: string) => void;
  onDelete: (key: string) => void;
}

export function EnvVarRow({ envKey, value, matchedService, onUpdate, onDelete }: EnvVarRowProps) {
  const [visible, setVisible] = useState(false);
  const [localValue, setLocalValue] = useState(value);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  return (
    <div className="env-var-row">
      <div className="env-var-row__key">
        <code>{envKey}</code>
        {matchedService && (
          <Badge variant="subtle" size="sm" color="accent">
            {matchedService.name}
          </Badge>
        )}
      </div>
      <div className="env-var-row__value">
        <Input
          size="sm"
          variant="ghost"
          type={visible ? 'text' : 'password'}
          value={localValue}
          onChange={handleChange}
          placeholder="Value..."
          style={{ fontFamily: 'var(--font-mono)', flex: 1 }}
        />
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          icon={visible ? eyeOff : eye}
          onClick={() => setVisible(!visible)}
          aria-label={visible ? 'Hide value' : 'Show value'}
        />
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          icon={trash2}
          onClick={() => onDelete(envKey)}
          aria-label="Delete variable"
        />
        {showGetKey && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => openUrl(matchedService.portalUrl)}
          >
            Get Key
          </Button>
        )}
      </div>
    </div>
  );
}
