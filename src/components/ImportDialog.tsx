import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { Dialog } from '@base/primitives/dialog';
import '@base/primitives/dialog/dialog.css';
import { Button } from '@base/primitives/button';
import '@base/primitives/button/button.css';
import { Checkbox } from '@base/primitives/checkbox';
import '@base/primitives/checkbox/checkbox.css';
import { check } from '@base/primitives/icon/icons/check';
import { x } from '@base/primitives/icon/icons/x';
import type { EnvVar } from '../types';
import './ImportDialog.css';

interface ImportDialogProps {
  open: boolean;
  projectId: string;
  onClose: () => void;
  onImported: (count: number) => void;
}

function parseEnvContent(content: string): EnvVar[] {
  const vars: EnvVar[] = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key) vars.push({ key, value });
  }
  return vars;
}

export function ImportDialog({ open, projectId, onClose, onImported }: ImportDialogProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'paste' | 'file'>('paste');
  const [pasteContent, setPasteContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [parsedVars, setParsedVars] = useState<EnvVar[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleParse = (content: string) => {
    const vars = parseEnvContent(content);
    setParsedVars(vars);
    setSelected(new Set(vars.map((v) => v.key)));
  };

  const handlePasteChange = (val: string) => {
    setPasteContent(val);
    handleParse(val);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      handleParse(text);
    };
    reader.onerror = () => {
      setParsedVars([]);
      setFileName('');
    };
    reader.readAsText(file);
  };

  const toggleVar = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleImport = async () => {
    const vars = parsedVars.filter((v) => selected.has(v.key));
    if (vars.length === 0) return;
    setImporting(true);
    try {
      const count = await invoke<number>('batch_add_vars', { projectId, vars });
      onImported(count);
      handleReset();
      onClose();
    } catch {
      // Silently fail — toast will be shown by parent
    } finally {
      setImporting(false);
    }
  };

  const handleReset = () => {
    setPasteContent('');
    setFileName('');
    setParsedVars([]);
    setSelected(new Set());
    setMode('paste');
  };

  return (
    <Dialog
      open={open}
      onClose={() => { handleReset(); onClose(); }}
      title={t('importDialog.title')}
      description={t('importDialog.description')}
      size="lg"
    >
      <div className="import-dialog__tabs">
        <button
          className={`import-dialog__tab ${mode === 'paste' ? 'import-dialog__tab--active' : ''}`}
          onClick={() => setMode('paste')}
        >
          {t('importDialog.paste')}
        </button>
        <button
          className={`import-dialog__tab ${mode === 'file' ? 'import-dialog__tab--active' : ''}`}
          onClick={() => setMode('file')}
        >
          {t('importDialog.file')}
        </button>
      </div>

      <div className="import-dialog__body">
        {mode === 'paste' && (
          <textarea
            className="import-dialog__textarea"
            value={pasteContent}
            onChange={(e) => handlePasteChange(e.target.value)}
            placeholder={t('importDialog.pastePlaceholder')}
            autoFocus
          />
        )}

        {mode === 'file' && (
          <>
            <div
              className="import-dialog__file-drop"
              onClick={() => fileInputRef.current?.click()}
            >
              {fileName ? (
                <span className="import-dialog__file-name">{fileName}</span>
              ) : (
                <>
                  <span>{t('importDialog.clickToSelect')}</span>
                  <span style={{ fontSize: 11 }}>{t('importDialog.fileHint')}</span>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".env,.env.*,.txt"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
          </>
        )}

        {parsedVars.length > 0 && (
          <div className="import-dialog__preview">
            {parsedVars.map((v) => (
              <div key={v.key} className="import-dialog__preview-row">
                <Checkbox
                  checked={selected.has(v.key)}
                  onChange={() => toggleVar(v.key)}
                />
                <span className="import-dialog__preview-key">{v.key}</span>
                <span className="import-dialog__preview-value">
                  {'•'.repeat(Math.min(v.value.length, 20)) || '(empty)'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {parsedVars.length > 0 && (
        <div className="import-dialog__actions">
          <span className="import-dialog__count">
            {t('importDialog.selectedCount', { selected: selected.size, total: parsedVars.length })}
          </span>
          <Button variant="ghost" size="md" icon={x} onClick={() => { handleReset(); onClose(); }}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            size="md"
            icon={check}
            onClick={handleImport}
            disabled={importing || selected.size === 0}
          >
            {importing ? t('importDialog.importing') : t('importDialog.import')}
          </Button>
        </div>
      )}
    </Dialog>
  );
}
