import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@base/primitives/button';
import '@base/primitives/button/button.css';
import { Badge } from '@base/primitives/badge';
import '@base/primitives/badge/badge.css';
import { Icon } from '@base/primitives/icon';
import '@base/primitives/icon/icon.css';
import { folderOpen } from '@base/primitives/icon/icons/folder-open';
import { scan } from '@base/primitives/icon/icons/scan';
import { plus } from '@base/primitives/icon/icons/plus';
import { trash2 } from '@base/primitives/icon/icons/trash-2';
import { filePlus } from '@base/primitives/icon/icons/file-plus';
import { terminal } from '@base/primitives/icon/icons/terminal';
import { x } from '@base/primitives/icon/icons/x';
import { ScanBanner } from '../components/ScanBanner';
import { ProfileSwitcher } from '../components/ProfileSwitcher';
import { EnvEditor } from '../components/EnvEditor';
import { EnvWizard } from '../components/EnvWizard';
import { GitBanner } from '../components/GitBanner';
import { DiffView } from '../components/DiffView';
import { TeamPanel } from '../components/TeamPanel';
import { useScanner } from '../hooks/useScanner';
import { useProjects } from '../hooks/useProjects';
import { useProfiles } from '../hooks/useProfiles';
import { useDirectory } from '../hooks/useDirectory';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToastContext } from '../contexts/ToastContext';
import { invoke } from '@tauri-apps/api/core';
import type { EnvFileGroup, EnvVar } from '../types';
import { FrameworkChip } from '../components/FrameworkChip';
import { ProjectIcon } from '../components/ProjectIcon';
import { InfoGuide } from '../components/InfoGuide';
import stashIcon from '../assets/stash-icon.png';
import './VaultsPage.css';

interface VaultsPageProps {
  tourShowDemo?: boolean;
}

export function VaultsPage({ tourShowDemo }: VaultsPageProps) {
  const { t } = useTranslation();
  const { scanning, progress, results, startScan, dismiss } = useScanner();
  const {
    projects, activeProject, vars, rotation, expiry,
    loadProjects, importProject, selectProject,
    updateVar, addVar, deleteVar, setKeyExpiry, deleteProject,
  } = useProjects();
  const { profiles, activeProfile, loadProfiles, switchProfile, createProfile } = useProfiles();
  const { matchEnvKey } = useDirectory();
  const toast = useToastContext();
  const [detailTab, setDetailTab] = useState<'editor' | 'diff' | 'team'>('editor');
  const [wizardMode, setWizardMode] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [cliInstalled, setCliInstalled] = useState<boolean | null>(null);
  const [cliBannerDismissed, setCliBannerDismissed] = useState(() => localStorage.getItem('stash-cli-banner-dismissed') === 'true');

  useEffect(() => { loadProjects(); }, [loadProjects]);

  useEffect(() => {
    invoke<boolean>('check_cli_installed').then(setCliInstalled).catch(() => setCliInstalled(false));
  }, []);

  // Check if navigated from Discover with a project to select
  useEffect(() => {
    const pendingId = localStorage.getItem('stash-select-project');
    if (pendingId && projects.length > 0) {
      localStorage.removeItem('stash-select-project');
      selectProject(pendingId);
    }
  }, [projects, selectProject]);

  useEffect(() => {
    if (activeProject) loadProfiles(activeProject.id);
  }, [activeProject, loadProfiles]);

  const handleImport = async (group: EnvFileGroup) => {
    await importProject(group.project_path, group.project_name);
    toast.success(t('vaults.imported', { name: group.project_name }));
  };

  const handleDeleteProject = async (id: string) => {
    const name = projects.find((p) => p.id === id)?.name || 'project';
    await deleteProject(id);
    setConfirmDelete(null);
    toast.info(t('vaults.removed', { name }));
  };

  const handleGenerate = async (path: string, name: string, vars: EnvVar[]) => {
    try {
      await invoke('generate_env_file', { path, vars });
      // Derive the project directory from the .env file path
      const projectDir = path.endsWith('.env')
        ? path.replace(/\/\.env$/, '')
        : path;
      await importProject(projectDir, name);
      await loadProjects();
      setWizardMode(false);
      toast.success(t('vaults.created', { name, count: vars.length }));
    } catch (err) {
      toast.error(t('vaults.generateFailed', { error: String(err) }));
    }
  };

  const unimportedResults = results.filter(
    (r) => !projects.some((p) => p.path === r.project_path)
  );

  const hasContent = projects.length > 0 || unimportedResults.length > 0 || tourShowDemo;

  return (
    <div className="vaults-page">
      {(scanning || progress) && (
        <ScanBanner scanning={scanning} progress={progress} results={results} onDismiss={dismiss} />
      )}

      {/* Empty state — no projects, no scan results */}
      {!hasContent && !scanning && (
        <div className="vaults-page__empty">
          <img src={stashIcon} alt="" className="vaults-page__empty-img" />
          <p className="vaults-page__empty-text">{t('vaults.emptyTitle')}</p>
          <p className="vaults-page__empty-hint">{t('vaults.emptyHint')}</p>
          <Button variant="primary" icon={scan} onClick={startScan}>
            {t('vaults.scanForEnvs')}
          </Button>
        </div>
      )}

      {/* CLI promotion banner */}
      {cliInstalled === false && !cliBannerDismissed && (
        <div className="vaults-page__cli-banner">
          <div className="vaults-page__cli-banner-icon">
            <Icon icon={terminal} size="sm" />
          </div>
          <div className="vaults-page__cli-banner-text">
            <span className="vaults-page__cli-banner-title">{t('cli.bannerTitle')}</span>
            <span className="vaults-page__cli-banner-desc">{t('cli.bannerDesc')}</span>
          </div>
          <div className="vaults-page__cli-banner-actions">
            <Button
              variant="primary"
              size="sm"
              icon={terminal}
              onClick={async () => {
                try {
                  await invoke('install_cli');
                  setCliInstalled(true);
                  toast.success(t('settings.cliInstalledToast'));
                } catch (e) {
                  toast.error(t('settings.installFailed', { error: String(e) }));
                }
              }}
            >
              {t('cli.bannerInstall')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={x}
              iconOnly
              onClick={() => {
                localStorage.setItem('stash-cli-banner-dismissed', 'true');
                setCliBannerDismissed(true);
              }}
              aria-label={t('cli.bannerDismiss')}
            />
          </div>
        </div>
      )}

      {/* Main two-panel layout */}
      {hasContent && (
        <div className="vaults-page__projects">
          {/* Left sidebar: discover + project list */}
          <div className="vaults-page__project-list">
            {/* Discover section */}
            {unimportedResults.length > 0 && (
              <div className="vaults-page__discover">
                <div className="vaults-page__list-header">
                  <span className="vaults-page__list-title">{t('vaults.discovered')}</span>
                  <Badge variant="subtle" size="sm" color="accent">{unimportedResults.length}</Badge>
                </div>
                {unimportedResults.map((group) => (
                  <div key={group.project_path} className="vaults-page__discover-item">
                    <div className="vaults-page__discover-info">
                      <Icon icon={folderOpen} size="xs" color="tertiary" />
                      <span className="vaults-page__discover-name">{group.project_name}</span>
                    </div>
                    <Button variant="ghost" size="sm" icon={plus} iconOnly onClick={() => handleImport(group)} aria-label="Import" />
                  </div>
                ))}
              </div>
            )}

            {/* Project list */}
            <div className="vaults-page__list-header">
              <span className="vaults-page__list-title">{t('vaults.projects')}</span>
              <div className="vaults-page__list-actions">
                <Button variant="ghost" size="sm" icon={filePlus} onClick={() => setWizardMode(true)}>{t('vaults.new')}</Button>
                <Button variant="ghost" size="sm" icon={scan} onClick={startScan}>{t('vaults.scan')}</Button>
              </div>
            </div>
            {projects.length === 0 && (
              <p className="vaults-page__no-projects">{t('vaults.noProjects')}</p>
            )}
            {projects.map((p, i) => (
              <button
                key={p.id}
                className={`vaults-page__project-item ${activeProject?.id === p.id ? 'vaults-page__project-item--active' : ''}`}
                onClick={() => selectProject(p.id)}
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <ProjectIcon projectPath={p.path} projectName={p.name} size={32} />
                <div className="vaults-page__project-item-detail">
                  <div className="vaults-page__project-item-top">
                    <span className="vaults-page__project-name">{p.name}</span>
                    {p.framework && <FrameworkChip framework={p.framework} />}
                  </div>
                  <span className="vaults-page__project-path" title={p.path}>
                    {p.path.replace(/^\/Users\/[^/]+\//, '~/')}
                  </span>
                </div>
              </button>
            ))}
          </div>

          {/* Right panel: env editor or wizard */}
          <div className="vaults-page__project-detail">
            {wizardMode ? (
              <EnvWizard
                projects={projects}
                onGenerate={handleGenerate}
                onCancel={() => setWizardMode(false)}
              />
            ) : activeProject ? (
              <>
                <div className="vaults-page__detail-header">
                  <h2 className="vaults-page__detail-title">{activeProject.name}</h2>
                  <div className="vaults-page__detail-tabs">
                    <button
                      className={`vaults-page__tab ${detailTab === 'editor' ? 'vaults-page__tab--active' : ''}`}
                      onClick={() => setDetailTab('editor')}
                    >{t('vaults.editor')}</button>
                    {profiles.length >= 2 && (
                      <button
                        className={`vaults-page__tab ${detailTab === 'diff' ? 'vaults-page__tab--active' : ''}`}
                        onClick={() => setDetailTab('diff')}
                      >{t('vaults.diff')}</button>
                    )}
                    <button
                      className={`vaults-page__tab ${detailTab === 'team' ? 'vaults-page__tab--active' : ''}`}
                      onClick={() => setDetailTab('team')}
                    >{t('vaults.team')}</button>
                  </div>
                  <Button
                    variant="ghost" size="sm" iconOnly icon={trash2}
                    onClick={() => setConfirmDelete(activeProject.id)}
                    aria-label="Delete project"
                  />
                </div>
                {detailTab === 'editor' && (
                  <>
                    <div style={{ padding: '12px 16px 0' }}>
                      <InfoGuide
                        storageKey="stash-guide-editor-dismissed"
                        titleKey="guide.editor.title"
                        stepKeys={['guide.editor.step1', 'guide.editor.step2', 'guide.editor.step3', 'guide.editor.step4']}
                      />
                    </div>
                    <GitBanner projectPath={activeProject.path} />
                    <ProfileSwitcher
                      profiles={profiles}
                      activeProfile={activeProfile}
                      onSwitch={(name) => activeProject && switchProfile(activeProject.id, name)}
                      onCreate={(name, copyFrom) => activeProject && createProfile(activeProject.id, name, copyFrom)}
                    />
                    <EnvEditor
                      vars={vars}
                      projectId={activeProject.id}
                      onUpdate={updateVar}
                      onAdd={addVar}
                      onDelete={deleteVar}
                      matchEnvKey={matchEnvKey}
                      rotation={rotation}
                      expiry={expiry}
                      onSetExpiry={setKeyExpiry}
                      framework={activeProject.framework}
                    />
                  </>
                )}
                {detailTab === 'diff' && (
                  <DiffView projectId={activeProject.id} profiles={profiles} />
                )}
                {detailTab === 'team' && (
                  <TeamPanel projectId={activeProject.id} />
                )}
              </>
            ) : tourShowDemo ? (
              <>
                <div className="vaults-page__detail-header">
                  <h2 className="vaults-page__detail-title">my-app</h2>
                  <div className="vaults-page__detail-tabs">
                    <button className="vaults-page__tab vaults-page__tab--active">{t('vaults.editor')}</button>
                    <button className="vaults-page__tab">{t('vaults.diff')}</button>
                    <button className="vaults-page__tab">{t('vaults.team')}</button>
                  </div>
                </div>
                <div className="vaults-page__tour-demo">
                  <div className="vaults-page__tour-demo-row">
                    <code>DATABASE_URL</code>
                    <span className="vaults-page__tour-demo-dots">{'●'.repeat(12)}</span>
                  </div>
                  <div className="vaults-page__tour-demo-row">
                    <code>API_KEY</code>
                    <span className="vaults-page__tour-demo-dots">{'●'.repeat(16)}</span>
                  </div>
                  <div className="vaults-page__tour-demo-row">
                    <code>SECRET_TOKEN</code>
                    <span className="vaults-page__tour-demo-dots">{'●'.repeat(20)}</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="vaults-page__detail-empty">
                <div style={{ width: '100%', maxWidth: 400 }}>
                  <InfoGuide
                    storageKey="stash-guide-vaults-dismissed"
                    titleKey="guide.vaults.title"
                    stepKeys={['guide.vaults.step1', 'guide.vaults.step2', 'guide.vaults.step3', 'guide.vaults.step4']}
                  />
                </div>
                <img src={stashIcon} alt="" className="vaults-page__empty-img" />
                <p className="vaults-page__empty-text">{t('vaults.selectProject')}</p>
                <p className="vaults-page__empty-hint">{t('vaults.selectProjectHint')}</p>
                <Button className="vaults-create-btn" variant="secondary" size="md" icon={filePlus} onClick={() => setWizardMode(true)}>
                  {t('vaults.createNewEnv')}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        title={t('vaults.deleteProject')}
        message={t('vaults.deleteProjectMsg')}
        confirmLabel={t('vaults.delete')}
        destructive
        onConfirm={() => confirmDelete && handleDeleteProject(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
