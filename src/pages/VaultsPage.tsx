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
import { StashSetupBanner } from '../components/StashSetupBanner';
import { StashLockPanel } from '../components/StashLockPanel';
import { ProjectSettings } from '../components/ProjectSettings';
import { DiffView } from '../components/DiffView';
import { TeamPanel } from '../components/TeamPanel';
import { useScanner } from '../hooks/useScanner';
import { useProjects } from '../hooks/useProjects';
import { useProfiles } from '../hooks/useProfiles';
import { useDirectory } from '../hooks/useDirectory';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToastContext } from '../contexts/ToastContext';
import { useSavedKeys } from '../hooks/useSavedKeys';
import { useLockMetadata } from '../hooks/useLockMetadata';
import { invoke } from '@tauri-apps/api/core';
import type { EnvFileGroup, EnvVar, ApiService } from '../types';
import { FrameworkChip } from '../components/FrameworkChip';
import { ProjectIcon } from '../components/ProjectIcon';
import { Tip } from '../components/Tip';
import stashIcon from '../assets/stash-icon.png';
import './VaultsPage.css';

interface VaultsPageProps {
  tourShowDemo?: boolean;
  onNavigateToDiscover?: () => void;
}

export function VaultsPage({ tourShowDemo, onNavigateToDiscover }: VaultsPageProps) {
  const { t } = useTranslation();
  const { scanning, progress, results, startScan, dismiss } = useScanner();
  const {
    projects, activeProject, vars, rotation,
    loadProjects, importProject, selectProject,
    updateVar, addVar, deleteVar, deleteProject,
  } = useProjects();
  const { profiles, activeProfile, loadProfiles, switchProfile, createProfile, deleteProfile } = useProfiles();
  const { matchEnvKey } = useDirectory();
  const { keys: savedKeys, refresh: refreshSavedKeys, addKey: addSavedKey } = useSavedKeys();
  const lockMeta = useLockMetadata(activeProject?.id);
  const toast = useToastContext();
  const [detailTab, setDetailTab] = useState<'editor' | 'diff' | 'sharing' | 'settings'>('editor');
  const [wizardMode, setWizardMode] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [cliInstalled, setCliInstalled] = useState<boolean | null>(null);
  const [cliBannerDismissed, setCliBannerDismissed] = useState(() => localStorage.getItem('stash-cli-banner-dismissed') === 'true');

  useEffect(() => { loadProjects(); refreshSavedKeys(); }, [loadProjects, refreshSavedKeys]);

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
    if (activeProject) {
      loadProfiles(activeProject.id);
      lockMeta.load();
    }
  }, [activeProject, loadProfiles, lockMeta.load]);

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
          <Button variant="primary" icon={scan} onClick={onNavigateToDiscover || startScan}>
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
            <Tip content={t('cli.bannerDismiss')}>
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
            </Tip>
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
                {unimportedResults.slice(0, 3).map((group) => (
                  <div key={group.project_path} className="vaults-page__discover-item">
                    <div className="vaults-page__discover-info">
                      <Icon icon={folderOpen} size="xs" color="tertiary" />
                      <span className="vaults-page__discover-name">{group.project_name}</span>
                    </div>
                    <Tip content={t('vaults.import')}><Button variant="ghost" size="sm" icon={plus} iconOnly onClick={() => handleImport(group)} aria-label={t('vaults.import')} /></Tip>
                  </div>
                ))}
                {unimportedResults.length > 3 && onNavigateToDiscover && (
                  <button className="vaults-page__discover-more" onClick={onNavigateToDiscover}>
                    {t('vaults.andMore', { count: unimportedResults.length - 3 })}
                  </button>
                )}
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
                <StashSetupBanner
                  projectId={activeProject.id}
                  projectName={activeProject.name}
                />
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
                      className={`vaults-page__tab ${detailTab === 'sharing' ? 'vaults-page__tab--active' : ''}`}
                      onClick={() => setDetailTab('sharing')}
                    >{t('vaults.sharing')}</button>
                    <button
                      className={`vaults-page__tab ${detailTab === 'settings' ? 'vaults-page__tab--active' : ''}`}
                      onClick={() => setDetailTab('settings')}
                    >{t('vaults.settings')}</button>
                  </div>
                  <Tip content={t('vaults.deleteProject')}>
                    <Button
                      variant="ghost" size="sm" iconOnly icon={trash2}
                      onClick={() => setConfirmDelete(activeProject.id)}
                      aria-label={t('vaults.deleteProject')}
                    />
                  </Tip>
                </div>
                {detailTab === 'editor' && (
                  <>
                    <GitBanner projectPath={activeProject.path} />
                    <ProfileSwitcher
                      profiles={profiles}
                      activeProfile={activeProfile}
                      customColors={lockMeta.get<Record<string, string>>('profile_colors')}
                      onColorChange={async (profileName, color) => {
                        const colors = lockMeta.get<Record<string, string>>('profile_colors', {});
                        await lockMeta.set('profile_colors', { ...colors, [profileName]: color });
                      }}
                      onSwitch={async (name) => {
                        if (!activeProject) return;
                        await switchProfile(activeProject.id, name);
                        selectProject(activeProject.id);
                      }}
                      onCreate={async (name, copyValues, copyFrom) => {
                        if (!activeProject) return;
                        await createProfile(activeProject.id, name, copyValues, copyFrom);
                        selectProject(activeProject.id);
                      }}
                      onDelete={async (name) => {
                        if (!activeProject) return;
                        await deleteProfile(activeProject.id, name);
                        selectProject(activeProject.id);
                      }}
                    />
                    <StashLockPanel
                      projectId={activeProject.id}
                      onSynced={() => selectProject(activeProject.id)}
                    />
                    <EnvEditor
                      vars={vars}
                      projectId={activeProject.id}
                      onUpdate={updateVar}
                      onAdd={addVar}
                      onDelete={deleteVar}
                      matchEnvKey={matchEnvKey}
                      rotation={rotation}
                      framework={activeProject.framework}
                      savedKeys={savedKeys}
                      onSaveKey={async (envKey, value, service) => {
                        const svc = service as ApiService | null | undefined;
                        const serviceId = svc?.id || envKey.toLowerCase().replace(/_/g, '-');
                        const serviceName = svc?.name || envKey;
                        try {
                          await addSavedKey(serviceId, serviceName, envKey, value, '');
                          toast.success(t('envVarRow.keySaved', { key: envKey }));
                          refreshSavedKeys();
                        } catch (e) {
                          toast.error(String(e));
                        }
                      }}
                    />
                  </>
                )}
                {detailTab === 'diff' && (
                  <DiffView projectId={activeProject.id} profiles={profiles} />
                )}
                {detailTab === 'sharing' && (
                  <TeamPanel projectId={activeProject.id} />
                )}
                {detailTab === 'settings' && (
                  <ProjectSettings projectId={activeProject.id} projectPath={activeProject.path} />
                )}
              </>
            ) : tourShowDemo ? (
              <>
                <div className="vaults-page__detail-header">
                  <h2 className="vaults-page__detail-title">my-app</h2>
                  <div className="vaults-page__detail-tabs">
                    <button className="vaults-page__tab vaults-page__tab--active">{t('vaults.editor')}</button>
                    <button className="vaults-page__tab">{t('vaults.diff')}</button>
                    <button className="vaults-page__tab">{t('vaults.sharing')}</button>
                    <button className="vaults-page__tab">{t('vaults.settings')}</button>
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
