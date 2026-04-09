import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@base/primitives/button';
import '@base/primitives/button/button.css';
import { Input } from '@base/primitives/input';
import '@base/primitives/input/input.css';
import { Badge } from '@base/primitives/badge';
import '@base/primitives/badge/badge.css';
import { Icon } from '@base/primitives/icon';
import '@base/primitives/icon/icon.css';
import { Separator } from '@base/primitives/separator';
import '@base/primitives/separator/separator.css';
import { key } from '@base/primitives/icon/icons/key';
import { users } from '@base/primitives/icon/icons/users';
import { plus } from '@base/primitives/icon/icons/plus';
import { x } from '@base/primitives/icon/icons/x';
import { useDevelopers } from '../hooks/useDevelopers';
import { useTeam } from '../hooks/useTeam';
import { useProjects } from '../hooks/useProjects';
import { useToastContext } from '../contexts/ToastContext';
import './DevelopersPage.css';

export function DevelopersPage() {
  const { t } = useTranslation();
  const { developers, myPublicKey, loading, refresh } = useDevelopers();
  const team = useTeam();
  const { projects, loadProjects } = useProjects();
  const toast = useToastContext();

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newKey, setNewKey] = useState('');
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set());

  useEffect(() => {
    team.loadKey();
    loadProjects();
    refresh();
  }, [refresh, loadProjects]);

  const handleGenerateKey = async () => {
    await team.generateKey();
    toast.success(t('developers.keypairGenerated'));
    refresh();
  };

  const handleCopyKey = () => {
    navigator.clipboard.writeText(myPublicKey);
    toast.info(t('developers.keyCopied'));
  };

  const handleAddMember = async () => {
    if (!newName.trim() || !newKey.trim() || selectedProjects.size === 0) return;
    try {
      // Add member to each selected project
      for (const projectId of selectedProjects) {
        await invoke('add_team_member', {
          projectId,
          name: newName.trim(),
          publicKey: newKey.trim(),
        });
      }
      toast.success(t('developers.addedMember', { name: newName.trim(), count: selectedProjects.size }));
      setNewName('');
      setNewKey('');
      setSelectedProjects(new Set());
      setShowAdd(false);
      refresh();
    } catch (e) {
      toast.error(String(e));
    }
  };

  const handleRemoveFromProject = async (_publicKey: string, name: string, projectId: string, projectName: string) => {
    try {
      await invoke('remove_team_member', { projectId, name });
      toast.info(t('developers.removedMember', { name, project: projectName }));
      refresh();
    } catch (e) {
      toast.error(String(e));
    }
  };

  const toggleProject = (id: string) => {
    setSelectedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="developers-page">
      {/* Your Identity */}
      <div className="developers-page__identity">
        {myPublicKey ? (
          <div className="developers-page__identity-card">
            <span className="developers-page__identity-status developers-page__identity-status--active" />
            <div className="developers-page__identity-info">
              <span className="developers-page__identity-label">{t('developers.yourPublicKey')}</span>
              <span className="developers-page__identity-key">
                {myPublicKey.slice(0, 32)}...{myPublicKey.slice(-8)}
              </span>
            </div>
            <Button variant="ghost" size="sm" onClick={handleCopyKey}>{t('developers.copy')}</Button>
          </div>
        ) : (
          <div className="developers-page__identity-hint">
            <Icon icon={key} size="lg" color="currentColor" />
            <p>{t('developers.generateKeypairHint')}</p>
            <Button variant="primary" size="md" onClick={handleGenerateKey}>{t('developers.generateKeypair')}</Button>
          </div>
        )}
      </div>

      {/* Team Members Header */}
      <div className="developers-page__section-header">
        <span className="developers-page__section-title">
          {t('developers.teamMembers')}
          {developers.length > 0 && (
            <Badge variant="subtle" size="sm" color="neutral" style={{ marginLeft: 8 }}>
              {developers.length}
            </Badge>
          )}
        </span>
        <Button variant="ghost" size="sm" icon={showAdd ? x : plus} onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? t('developers.cancel') : t('developers.addMember')}
        </Button>
      </div>

      {/* Add Member Form */}
      {showAdd && (
        <div className="developers-page__add-form">
          <div className="developers-page__add-form-fields">
            <Input
              size="md"
              variant="outline"
              placeholder={t('developers.namePlaceholder')}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <Input
              size="md"
              variant="outline"
              placeholder={t('developers.pastePublicKey')}
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              style={{ fontFamily: 'var(--font-mono)' }}
            />
          </div>
          <div className="developers-page__add-form-projects">
            <span className="developers-page__add-form-label">{t('developers.addToProjects')}</span>
            <div className="developers-page__project-chips">
              {projects.map((p) => (
                <button
                  key={p.id}
                  className={`developers-page__project-chip ${selectedProjects.has(p.id) ? 'developers-page__project-chip--selected' : ''}`}
                  onClick={() => toggleProject(p.id)}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
          <Button
            variant="primary"
            size="md"
            onClick={handleAddMember}
            disabled={!newName.trim() || !newKey.trim() || selectedProjects.size === 0}
          >
            {t('developers.addToCount', { count: selectedProjects.size })}
          </Button>
        </div>
      )}

      <Separator />

      {/* Members List */}
      {developers.length === 0 && !loading ? (
        <div className="developers-page__empty">
          <Icon icon={users} size="lg" color="currentColor" />
          <span className="developers-page__empty-title">{t('developers.noTeamMembers')}</span>
          <span className="developers-page__empty-hint">
            {t('developers.noTeamMembersHint')}
          </span>
        </div>
      ) : (
        <div className="developers-page__list">
          {developers.map((dev, i) => {
            const isYou = dev.public_key === myPublicKey;
            const initial = dev.name.charAt(0).toUpperCase();
            return (
              <div key={dev.public_key} className="developers-page__member" style={{ animationDelay: `${i * 40}ms` }}>
                <div className="developers-page__member-avatar">{initial}</div>
                <div className="developers-page__member-info">
                  <div className="developers-page__member-header">
                    <span className="developers-page__member-name">{dev.name}</span>
                    {isYou && <span className="developers-page__member-you">{t('developers.you')}</span>}
                  </div>
                  <div className="developers-page__member-key">
                    {dev.public_key.slice(0, 32)}...{dev.public_key.slice(-8)}
                  </div>
                  <div className="developers-page__member-projects">
                    {dev.projects.map((p) => (
                      <span key={p.id} className="developers-page__project-pill">
                        {p.name}
                        {!isYou && (
                          <button
                            className="developers-page__project-pill-remove"
                            onClick={() => handleRemoveFromProject(dev.public_key, dev.name, p.id, p.name)}
                            title={`Remove from ${p.name}`}
                          >
                            ×
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
