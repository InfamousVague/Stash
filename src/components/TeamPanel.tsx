import { useEffect, useState } from 'react';
import { Button } from '@base/primitives/button';
import '@base/primitives/button/button.css';
import { Input } from '@base/primitives/input';
import '@base/primitives/input/input.css';
import { Badge } from '@base/primitives/badge';
import '@base/primitives/badge/badge.css';
import { Separator } from '@base/primitives/separator';
import '@base/primitives/separator/separator.css';
import { useTeam } from '../hooks/useTeam';
import { useToastContext } from '../contexts/ToastContext';
import './TeamPanel.css';

interface TeamPanelProps {
  projectId: string;
}

export function TeamPanel({ projectId }: TeamPanelProps) {
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
    toast.success('Keypair generated');
  };

  const handleCopyKey = () => {
    navigator.clipboard.writeText(team.publicKey);
    toast.info('Public key copied to clipboard');
  };

  const handleAddMember = async () => {
    if (!newName.trim() || !newKey.trim()) return;
    try {
      await team.addMember(projectId, newName.trim(), newKey.trim());
      setNewName('');
      setNewKey('');
      setShowAdd(false);
      toast.success(`Added ${newName.trim()}`);
    } catch (e) {
      toast.error(String(e));
    }
  };

  const handlePush = async () => {
    try {
      await team.pushLock(projectId);
      toast.success('Pushed to .stash.lock');
    } catch (e) {
      toast.error(`Push failed: ${e}`);
    }
  };

  const handlePull = async () => {
    try {
      await team.pullLock(projectId);
      toast.success('Pulled from .stash.lock');
    } catch (e) {
      toast.error(`Pull failed: ${e}`);
    }
  };

  return (
    <div className="team-panel">
      {/* Your Key */}
      <section className="team-panel__section">
        <h3 className="team-panel__section-title">Your Public Key</h3>
        {team.publicKey ? (
          <div className="team-panel__key-row">
            <code className="team-panel__key">{team.publicKey.slice(0, 24)}...{team.publicKey.slice(-8)}</code>
            <Button variant="ghost" size="sm" onClick={handleCopyKey}>Copy</Button>
          </div>
        ) : (
          <div>
            <p className="team-panel__hint">Generate a keypair to enable team sharing.</p>
            <Button variant="primary" size="md" onClick={handleGenerateKey}>Generate Keypair</Button>
          </div>
        )}
      </section>

      <Separator />

      {/* Sync Actions */}
      <section className="team-panel__section">
        <h3 className="team-panel__section-title">Sync</h3>
        <div className="team-panel__actions">
          <Button variant="secondary" size="md" onClick={handlePush}>
            Push to .stash.lock
          </Button>
          <Button variant="secondary" size="md" onClick={handlePull}>
            Pull from .stash.lock
          </Button>
        </div>
        <p className="team-panel__hint">
          Push encrypts your .env for all team members. Pull decrypts your values from the lock file.
        </p>
      </section>

      <Separator />

      {/* Team Members */}
      <section className="team-panel__section">
        <div className="team-panel__section-header">
          <h3 className="team-panel__section-title">
            Team Members
            <Badge variant="subtle" size="sm" color="neutral">{team.members.length}</Badge>
          </h3>
          <Button variant="ghost" size="sm" onClick={() => setShowAdd(!showAdd)}>
            {showAdd ? 'Cancel' : '+ Add'}
          </Button>
        </div>

        {showAdd && (
          <div className="team-panel__add-form">
            <Input
              size="md" variant="outline"
              placeholder="Name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <Input
              size="md" variant="outline"
              placeholder="Paste their public key"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
            />
            <Button variant="primary" size="md" onClick={handleAddMember} disabled={!newName.trim() || !newKey.trim()}>
              Add Member
            </Button>
          </div>
        )}

        <div className="team-panel__members">
          {team.members.length === 0 ? (
            <p className="team-panel__hint">No team members yet. Add members and push to share.</p>
          ) : (
            team.members.map((m) => (
              <div key={m.name} className="team-panel__member">
                <div className="team-panel__member-info">
                  <span className="team-panel__member-name">{m.name}</span>
                  <code className="team-panel__member-key">{m.public_key.slice(0, 16)}...</code>
                </div>
                <Button
                  variant="ghost" size="sm"
                  onClick={() => team.removeMember(projectId, m.name)}
                >
                  Remove
                </Button>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
