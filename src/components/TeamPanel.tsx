import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@base/primitives/button';
import '@base/primitives/button/button.css';
import { Input } from '@base/primitives/input';
import '@base/primitives/input/input.css';
import { Badge } from '@base/primitives/badge';
import '@base/primitives/badge/badge.css';
import { Separator } from '@base/primitives/separator';
import '@base/primitives/separator/separator.css';
import { Icon } from '@base/primitives/icon';
import '@base/primitives/icon/icon.css';
import { keyRound } from '@base/primitives/icon/icons/key-round';
import { useTeam } from '../hooks/useTeam';
import { useToastContext } from '../contexts/ToastContext';
import { InfoGuide } from './InfoGuide';
import './TeamPanel.css';

interface TeamPanelProps {
  projectId: string;
}

export function TeamPanel({ projectId }: TeamPanelProps) {
  const { t } = useTranslation();
  const team = useTeam();
  const toast = useToastContext();
  const [newName, setNewName] = useState('');
  const [newKey, setNewKey] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    team.loadKey();
    team.loadMembers(projectId);
  }, [projectId]);

  const handleGenerateKey = async () => {
    await team.generateKey();
    toast.success(t('teamPanel.keypairGenerated'));
  };

  const handleCopyKey = () => {
    navigator.clipboard.writeText(team.publicKey);
    toast.info(t('teamPanel.keyCopied'));
  };

  const handleAddMember = async () => {
    if (!newName.trim() || !newKey.trim()) return;
    try {
      await team.addMember(projectId, newName.trim(), newKey.trim());
      setNewName('');
      setNewKey('');
      setShowAdd(false);
      toast.success(t('teamPanel.added', { name: newName.trim() }));
    } catch (e) {
      toast.error(String(e));
    }
  };

  return (
    <div className="team-panel">
      <InfoGuide
        storageKey="stash-team-guide-dismissed"
        titleKey="teamPanel.howItWorks"
        stepKeys={['teamPanel.step1', 'teamPanel.step2', 'teamPanel.step3', 'teamPanel.step4', 'teamPanel.step5']}
      />

      {/* Your Identity */}
      <section className="team-panel__section">
        <h3 className="team-panel__section-title">{t('teamPanel.yourIdentity')}</h3>
        {team.publicKey ? (
          <div className="team-panel__identity">
            <div className="team-panel__identity-status">
              <span className="team-panel__status-dot team-panel__status-dot--active" />
              <span className="team-panel__identity-label">{t('teamPanel.keypairActive')}</span>
            </div>
            <div className="team-panel__key-row">
              <code className="team-panel__key">{team.publicKey.slice(0, 24)}...{team.publicKey.slice(-8)}</code>
              <Button variant="ghost" size="sm" onClick={handleCopyKey}>{t('common.copy')}</Button>
            </div>
            <p className="team-panel__hint">{t('teamPanel.shareKeyHint')}</p>
          </div>
        ) : (
          <div className="team-panel__identity-empty">
            <Icon icon={keyRound} size="lg" color="currentColor" />
            <p className="team-panel__hint">
              {t('teamPanel.generateKeypairHint')}
            </p>
            <Button variant="primary" size="md" onClick={handleGenerateKey}>{t('teamPanel.generateKeypair')}</Button>
          </div>
        )}
      </section>

      <Separator />

      {/* Team Members */}
      <section className="team-panel__section">
        <div className="team-panel__section-header">
          <h3 className="team-panel__section-title">
            {t('teamPanel.teamMembers')}
            <Badge variant="subtle" size="sm" color="neutral">{team.members.length}</Badge>
          </h3>
          <Button variant="ghost" size="sm" onClick={() => setShowAdd(!showAdd)}>
            {showAdd ? t('teamPanel.cancel') : t('teamPanel.addMember')}
          </Button>
        </div>

        {showAdd && (
          <div className="team-panel__add-form">
            <Input
              size="md" variant="outline"
              placeholder={t('teamPanel.teammateName')}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <Input
              size="md" variant="outline"
              placeholder={t('teamPanel.pasteKey')}
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              style={{ fontFamily: 'var(--font-mono)' }}
            />
            <Button variant="primary" size="md" onClick={handleAddMember} disabled={!newName.trim() || !newKey.trim()}>
              {t('teamPanel.addMemberBtn')}
            </Button>
          </div>
        )}

        <div className="team-panel__members">
          {team.members.length === 0 ? (
            <p className="team-panel__hint">
              {t('teamPanel.noMembersHint')}
            </p>
          ) : (
            team.members.map((m) => (
              <div key={m.name} className="team-panel__member">
                <div className="team-panel__member-info">
                  <div className="team-panel__member-header">
                    <span className="team-panel__member-name">{m.name}</span>
                    <Badge variant="subtle" size="sm" color="success">{t('teamPanel.canDecrypt')}</Badge>
                  </div>
                  <code className="team-panel__member-key">{m.public_key.slice(0, 24)}...</code>
                </div>
                <Button
                  variant="ghost" size="sm"
                  onClick={() => team.removeMember(projectId, m.name)}
                >
                  {t('teamPanel.remove')}
                </Button>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
