import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { Input } from '@base/primitives/input';
import '@base/primitives/input/input.css';
import { Button } from '@base/primitives/button';
import '@base/primitives/button/button.css';
import { Badge } from '@base/primitives/badge';
import '@base/primitives/badge/badge.css';
import { Icon } from '@base/primitives/icon';
import '@base/primitives/icon/icon.css';
import { Tabs } from '@base/primitives/tabs';
import '@base/primitives/tabs/tabs.css';
import { Checkbox } from '@base/primitives/checkbox';
import '@base/primitives/checkbox/checkbox.css';
import { Select } from '@base/primitives/select';
import '@base/primitives/select/select.css';
import { arrowLeft } from '@base/primitives/icon/icons/arrow-left';
import { chevronDown } from '@base/primitives/icon/icons/chevron-down';
import { chevronUp } from '@base/primitives/icon/icons/chevron-up';
import { search } from '@base/primitives/icon/icons/search';
import { trash2 } from '@base/primitives/icon/icons/trash-2';
import { FRAMEWORK_SUGGESTIONS } from '../data/framework-suggestions';
import { getFrameworkColor } from '../data/framework-colors';
import { useDirectory } from '../hooks/useDirectory';
import type { Project, EnvVar } from '../types';
import { Tip } from './Tip';
import './EnvWizard.css';

type WizardTab = 'templates' | 'services' | 'clone';

const FRAMEWORKS = Object.keys(FRAMEWORK_SUGGESTIONS);

interface EnvWizardProps {
  projects: Project[];
  onGenerate: (path: string, name: string, vars: EnvVar[]) => void;
  onCancel: () => void;
}

export function EnvWizard({ projects, onGenerate, onCancel }: EnvWizardProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<WizardTab>('templates');
  const [vars, setVars] = useState<EnvVar[]>([]);
  const [outputPath, setOutputPath] = useState('');
  const [projectName, setProjectName] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  const [selectedFramework, setSelectedFramework] = useState<string | null>(null);
  const [selectedServices, setSelectedServices] = useState<Set<string>>(new Set());
  const directory = useDirectory();

  const [cloneProjectId, setCloneProjectId] = useState('');
  const [cloneProfile, setCloneProfile] = useState('default');
  const [cloneProfiles, setCloneProfiles] = useState<string[]>([]);
  const [copyValues, setCopyValues] = useState(true);

  useEffect(() => {
    if (!cloneProjectId) { setCloneProfiles([]); return; }
    invoke<string[]>('list_profiles', { projectId: cloneProjectId })
      .then((profiles) => { setCloneProfiles(profiles); setCloneProfile(profiles[0] || 'default'); })
      .catch(() => setCloneProfiles([]));
  }, [cloneProjectId]);

  useEffect(() => {
    if (!cloneProjectId || tab !== 'clone') return;
    invoke<EnvVar[]>('get_project_profile_vars', { projectId: cloneProjectId, profileName: cloneProfile })
      .then((cloneVars) => setVars(cloneVars.map((v) => ({ key: v.key, value: copyValues ? v.value : '' }))))
      .catch(() => setVars([]));
  }, [cloneProjectId, cloneProfile, copyValues, tab]);

  const handleFrameworkSelect = useCallback((fw: string) => {
    if (selectedFramework === fw) { setSelectedFramework(null); setVars([]); return; }
    setSelectedFramework(fw);
    setVars((FRAMEWORK_SUGGESTIONS[fw] || []).map((key) => ({ key, value: '' })));
  }, [selectedFramework]);

  const handleServiceToggle = useCallback((serviceId: string, envKeys: string[]) => {
    setSelectedServices((prev) => {
      const next = new Set(prev);
      if (next.has(serviceId)) {
        next.delete(serviceId);
        const keysToRemove = new Set(envKeys);
        setVars((v) => v.filter((item) => !keysToRemove.has(item.key)));
      } else {
        next.add(serviceId);
        setVars((v) => {
          const existing = new Set(v.map((item) => item.key));
          return [...v, ...envKeys.filter((k) => !existing.has(k)).map((k) => ({ key: k, value: '' }))];
        });
      }
      return next;
    });
  }, []);

  const updateVarValue = useCallback((key: string, value: string) => {
    setVars((prev) => prev.map((v) => (v.key === key ? { ...v, value } : v)));
  }, []);

  const removeVar = useCallback((key: string) => {
    setVars((prev) => prev.filter((v) => v.key !== key));
  }, []);

  const previewText = useMemo(() => vars.map((v) => `${v.key}=${v.value}`).join('\n'), [vars]);

  const handleGenerate = () => {
    if (!outputPath.trim() || !projectName.trim()) return;
    onGenerate(outputPath.endsWith('.env') ? outputPath : `${outputPath}/.env`, projectName, vars);
  };

  const handleTabSwitch = (newTab: WizardTab) => {
    if (newTab !== tab) {
      setVars([]); setSelectedFramework(null); setSelectedServices(new Set()); setCloneProjectId('');
      setTab(newTab);
    }
  };

  return (
    <div className="env-wizard">
      <div className="env-wizard__header">
        <Tip content={t('common.back')}><Button variant="ghost" size="sm" iconOnly icon={arrowLeft} onClick={onCancel} aria-label={t('common.back')} /></Tip>
        <h2>{t('envWizard.newEnvironment')}</h2>
      </div>

      <div className="env-wizard__tabs">
        <Tabs
          tabs={[
            { value: 'templates', label: t('envWizard.templates') },
            { value: 'services', label: t('envWizard.services') },
            { value: 'clone', label: t('envWizard.clone') },
          ]}
          value={tab}
          onChange={(v) => handleTabSwitch(v as WizardTab)}
          variant="underline"
          size="sm"
        />
      </div>

      <div className="env-wizard__content">
        {tab === 'templates' && (
          <TemplatesTab
            selectedFramework={selectedFramework}
            onSelectFramework={handleFrameworkSelect}
            vars={vars}
            onUpdateValue={updateVarValue}
            onRemoveVar={removeVar}
          />
        )}
        {tab === 'services' && (
          <ServicesTab
            directory={directory}
            selectedServices={selectedServices}
            onToggleService={handleServiceToggle}
            vars={vars}
            onUpdateValue={updateVarValue}
            onRemoveVar={removeVar}
          />
        )}
        {tab === 'clone' && (
          <CloneTab
            projects={projects}
            cloneProjectId={cloneProjectId}
            cloneProfile={cloneProfile}
            cloneProfiles={cloneProfiles}
            copyValues={copyValues}
            onSelectProject={setCloneProjectId}
            onSelectProfile={setCloneProfile}
            onToggleCopyValues={() => setCopyValues(!copyValues)}
            vars={vars}
            onUpdateValue={updateVarValue}
            onRemoveVar={removeVar}
          />
        )}
      </div>

      {vars.length > 0 && (
        <div className="env-wizard__preview">
          <button className="env-wizard__preview-header" onClick={() => setShowPreview(!showPreview)}>
            <Icon icon={showPreview ? chevronDown : chevronUp} size="xs" color="currentColor" />
            <span>{t('envWizard.preview')}</span>
            <Badge variant="subtle" size="sm" color="neutral">{t('envWizard.variables', { count: vars.length })}</Badge>
          </button>
          {showPreview && <div className="env-wizard__preview-content">{previewText}</div>}
        </div>
      )}

      <div className="env-wizard__footer">
        <Input size="md" variant="outline" placeholder={t('envWizard.projectName')} value={projectName}
          onChange={(e) => setProjectName(e.target.value)} style={{ flex: 1, minWidth: 0 }} />
        <Input size="md" variant="outline" placeholder={t('envWizard.outputPath')} value={outputPath}
          onChange={(e) => setOutputPath(e.target.value)} style={{ flex: 2, minWidth: 0 }} />
        <Button variant="primary" size="md" onClick={handleGenerate}
          disabled={!outputPath.trim() || !projectName.trim() || vars.length === 0}>
          {t('envWizard.generate')}
        </Button>
      </div>
    </div>
  );
}

// ── Templates Tab ─────────────────────────────────────────

function TemplatesTab({ selectedFramework, onSelectFramework, vars, onUpdateValue, onRemoveVar }: {
  selectedFramework: string | null;
  onSelectFramework: (fw: string) => void;
  vars: EnvVar[];
  onUpdateValue: (key: string, value: string) => void;
  onRemoveVar: (key: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <p className="env-wizard__hint">{t('envWizard.templateHint')}</p>
      <div className="env-wizard__frameworks">
        {FRAMEWORKS.map((fw) => {
          const color = getFrameworkColor(fw) || '#888';
          const isSelected = selectedFramework === fw;
          return (
            <button
              key={fw}
              className={`env-wizard__framework-btn ${isSelected ? 'env-wizard__framework-btn--selected' : ''}`}
              onClick={() => onSelectFramework(fw)}
              style={isSelected ? { borderColor: color, backgroundColor: `${color}15` } : undefined}
            >
              <span className="env-wizard__framework-dot" style={{ backgroundColor: color }} />
              {fw.charAt(0).toUpperCase() + fw.slice(1)}
            </button>
          );
        })}
      </div>
      {vars.length > 0 && (
        <VarList title={t('envWizard.variablesFor', { framework: selectedFramework })} vars={vars} onUpdateValue={onUpdateValue} onRemoveVar={onRemoveVar} />
      )}
    </>
  );
}

// ── Services Tab ──────────────────────────────────────────

function ServicesTab({ directory, selectedServices, onToggleService, vars, onUpdateValue, onRemoveVar }: {
  directory: ReturnType<typeof useDirectory>;
  selectedServices: Set<string>;
  onToggleService: (serviceId: string, envKeys: string[]) => void;
  vars: EnvVar[];
  onUpdateValue: (key: string, value: string) => void;
  onRemoveVar: (key: string) => void;
}) {
  const { t } = useTranslation();
  const { query, category, categories, filtered, searchServices, setCategory } = directory;

  return (
    <>
      <div className="env-wizard__service-search">
        <Input size="md" variant="outline" iconLeft={search} placeholder={t('envWizard.searchServices')}
          value={query} onChange={(e) => searchServices(e.target.value)} />
      </div>
      <div className="env-wizard__service-filters">
        <Button variant={category === null ? 'primary' : 'ghost'} size="sm" onClick={() => setCategory(null)}>{t('envWizard.all')}</Button>
        {categories.slice(0, 8).map((cat) => (
          <Button key={cat} variant={category === cat ? 'primary' : 'ghost'} size="sm"
            onClick={() => setCategory(category === cat ? null : cat)}>{cat}</Button>
        ))}
      </div>
      <div className="env-wizard__service-list">
        {filtered.slice(0, 20).map((svc) => {
          const isChecked = selectedServices.has(svc.id);
          return (
            <div
              key={svc.id}
              className={`env-wizard__service-item ${isChecked ? 'env-wizard__service-item--selected' : ''}`}
              onClick={() => onToggleService(svc.id, svc.envKeys)}
            >
              <div className="env-wizard__service-item-top">
                <Checkbox size="sm" checked={isChecked} onChange={() => onToggleService(svc.id, svc.envKeys)} />
                <span className="env-wizard__service-name">{svc.name}</span>
                <Badge variant="subtle" size="sm" color="neutral">{svc.category}</Badge>
              </div>
              <div className="env-wizard__service-item-keys">
                {svc.envKeys.map((k) => (
                  <code key={k} className="env-wizard__service-key-tag">{k}</code>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {vars.length > 0 && (
        <VarList title={t('envWizard.selectedVariables', { count: vars.length })} vars={vars} onUpdateValue={onUpdateValue} onRemoveVar={onRemoveVar} />
      )}
    </>
  );
}

// ── Clone Tab ─────────────────────────────────────────────

function CloneTab({ projects, cloneProjectId, cloneProfile, cloneProfiles, copyValues,
  onSelectProject, onSelectProfile, onToggleCopyValues, vars, onUpdateValue, onRemoveVar }: {
  projects: Project[];
  cloneProjectId: string;
  cloneProfile: string;
  cloneProfiles: string[];
  copyValues: boolean;
  onSelectProject: (id: string) => void;
  onSelectProfile: (name: string) => void;
  onToggleCopyValues: () => void;
  vars: EnvVar[];
  onUpdateValue: (key: string, value: string) => void;
  onRemoveVar: (key: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <p className="env-wizard__hint">{t('envWizard.cloneHint')}</p>
      <div className="env-wizard__clone-controls">
        <div className="env-wizard__form-field">
          <label className="env-wizard__form-label">{t('envWizard.sourceProject')}</label>
          <Select size="md" variant="outline" value={cloneProjectId} onChange={(e) => onSelectProject(e.target.value)}>
            <option value="">{t('envWizard.selectProject')}</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </div>
        {cloneProfiles.length > 0 && (
          <div className="env-wizard__form-field">
            <label className="env-wizard__form-label">{t('envWizard.profile')}</label>
            <Select size="md" variant="outline" value={cloneProfile} onChange={(e) => onSelectProfile(e.target.value)}>
              {cloneProfiles.map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
          </div>
        )}
        <div className="env-wizard__form-field">
          <Checkbox size="md" label={t('envWizard.copyValues')} checked={copyValues} onChange={onToggleCopyValues} />
          <span className="env-wizard__form-hint">{t('envWizard.copyValuesHint')}</span>
        </div>
      </div>
      {vars.length > 0 && (
        <VarList
          title={t('envWizard.variablesFrom', { count: vars.length, project: projects.find((p) => p.id === cloneProjectId)?.name })}
          vars={vars} onUpdateValue={onUpdateValue} onRemoveVar={onRemoveVar}
        />
      )}
    </>
  );
}

// ── Shared Var List ───────────────────────────────────────

function VarList({ title, vars, onUpdateValue, onRemoveVar }: {
  title: string;
  vars: EnvVar[];
  onUpdateValue: (key: string, value: string) => void;
  onRemoveVar: (key: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="env-wizard__var-section">
      <span className="env-wizard__section-title">{title}</span>
      <div className="env-wizard__var-list">
        {vars.map((v, i) => (
          <div key={v.key} className={`env-wizard__var-row ${i % 2 === 1 ? 'env-wizard__var-row--alt' : ''}`}>
            <code className="env-wizard__var-key">{v.key}</code>
            <div className="env-wizard__var-input">
              <Input size="md" variant="ghost" placeholder="value..." value={v.value}
                onChange={(e) => onUpdateValue(v.key, e.target.value)}
                style={{ fontFamily: 'var(--font-mono)', width: '100%' }} />
            </div>
            <Tip content={t('common.remove')}><Button variant="ghost" size="sm" iconOnly icon={trash2} onClick={() => onRemoveVar(v.key)} aria-label={t('common.remove')} /></Tip>
          </div>
        ))}
      </div>
    </div>
  );
}
