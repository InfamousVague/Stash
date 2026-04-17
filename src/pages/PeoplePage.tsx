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
import { trash2 } from '@base/primitives/icon/icons/trash-2';
import { copy } from '@base/primitives/icon/icons/copy';
import { link } from '@base/primitives/icon/icons/link';
import { usePeople } from '../hooks/usePeople';
import { useProjects } from '../hooks/useProjects';
import { useToastContext } from '../contexts/ToastContext';
import './PeoplePage.css';

interface PeoplePageProps {
  pendingContact?: { name: string; key: string } | null;
  onPendingHandled?: () => void;
}

export function PeoplePage({ pendingContact, onPendingHandled }: PeoplePageProps) {
  const { t } = useTranslation();
  const {
    people, myPublicKey, loading, refresh,
    addContact, removeContact, addToProject, removeFromProject, getShareLink,
  } = usePeople();
  const { projects, loadProjects } = useProjects();
  const toast = useToastContext();

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newKey, setNewKey] = useState('');
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set());

  useEffect(() => {
    refresh();
    loadProjects();
  }, [refresh, loadProjects]);

  // Auto-fill form when a pending contact arrives via deep link
  useEffect(() => {
    if (pendingContact && pendingContact.name && pendingContact.key) {
      setNewName(pendingContact.name);
      setNewKey(pendingContact.key);
      setShowAdd(true);
    }
  }, [pendingContact]);

  const handleGenerateKey = async () => {
    await invoke<string>('generate_team_key');
    toast.success(t('people.keypairGenerated'));
    refresh();
  };

  const handleCopyKey = () => {
    navigator.clipboard.writeText(myPublicKey);
    toast.info(t('people.keyCopied'));
  };

  const handleShareLink = async () => {
    try {
      const shareLink = await getShareLink('Me', myPublicKey);
      await navigator.clipboard.writeText(shareLink);
      toast.info(t('people.linkCopied'));
    } catch (e) {
      toast.error(String(e));
    }
  };

  const handleAdd = async () => {
    const name = newName.trim();
    const pubKey = newKey.trim();
    if (!name || !pubKey) return;
    try {
      // Always add as contact
      await addContact(name, pubKey);

      // Also add to selected projects
      for (const projectId of selectedProjects) {
        await addToProject(name, pubKey, projectId);
      }

      const msg = selectedProjects.size > 0
        ? t('people.addedWithProjects', { name, count: selectedProjects.size })
        : t('people.added', { name });
      toast.success(msg);

      setNewName('');
      setNewKey('');
      setSelectedProjects(new Set());
      setShowAdd(false);
      if (pendingContact) onPendingHandled?.();
      refresh();
    } catch (e) {
      toast.error(String(e));
    }
  };

  const handleRemove = async (publicKey: string, name: string) => {
    try {
      await removeContact(publicKey);
      toast.info(t('people.removed', { name }));
      refresh();
    } catch (e) {
      toast.error(String(e));
    }
  };

  const handleRemoveFromProject = async (name: string, projectId: string, projectName: string) => {
    try {
      await removeFromProject(name, projectId);
      toast.info(t('people.removedFromProject', { name, project: projectName }));
      refresh();
    } catch (e) {
      toast.error(String(e));
    }
  };

  const handleSharePerson = async (name: string, publicKey: string) => {
    try {
      const shareLink = await getShareLink(name, publicKey);
      await navigator.clipboard.writeText(shareLink);
      toast.info(t('people.linkCopied'));
    } catch (e) {
      toast.error(String(e));
    }
  };

  const handleDismissPending = () => {
    setNewName('');
    setNewKey('');
    setShowAdd(false);
    onPendingHandled?.();
  };

  const toggleProject = (id: string) => {
    setSelectedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  };

  // Filter out "you" from the people list — shown separately in identity card
  const otherPeople = people.filter((p) => !p.is_you);

  return (
    <div className="people-page">
      {/* Your Identity */}
      <div className="people-page__identity">
        {myPublicKey ? (
          <div className="people-page__identity-card">
            <span className="people-page__identity-status people-page__identity-status--active" />
            <div className="people-page__identity-info">
              <span className="people-page__identity-label">{t('people.yourIdentity')}</span>
              <span className="people-page__identity-sublabel">{t('people.shareYourKey')}</span>
              <span className="people-page__identity-key">
                {myPublicKey.slice(0, 32)}...{myPublicKey.slice(-8)}
              </span>
            </div>
            <div className="people-page__identity-actions">
              <Button variant="ghost" size="sm" icon={copy} onClick={handleCopyKey}>
                {t('people.copyKey')}
              </Button>
              <Button variant="ghost" size="sm" icon={link} onClick={handleShareLink}>
                {t('people.shareLink')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="people-page__identity-hint">
            <Icon icon={key} size="lg" color="currentColor" />
            <p>{t('people.generateFirst')}</p>
            <Button variant="primary" size="md" onClick={handleGenerateKey}>
              {t('people.generateKeypair')}
            </Button>
          </div>
        )}
      </div>

      {/* Pending deep-link contact banner */}
      {pendingContact && pendingContact.name && pendingContact.key && (
        <div className="people-page__pending">
          <span className="people-page__pending-title">{t('people.pendingTitle')}</span>
          <span className="people-page__pending-desc">
            {t('people.pendingDesc', { name: pendingContact.name })}
          </span>
          <div className="people-page__pending-actions">
            <Button variant="primary" size="sm" onClick={handleAdd}>
              {t('people.pendingConfirm')}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleDismissPending}>
              {t('people.pendingDismiss')}
            </Button>
          </div>
        </div>
      )}

      {/* People Header */}
      <div className="people-page__section-header">
        <span className="people-page__section-title">
          {t('people.title')}
          {otherPeople.length > 0 && (
            <Badge variant="subtle" size="sm" color="neutral" style={{ marginLeft: 8 }}>
              {otherPeople.length}
            </Badge>
          )}
        </span>
        <Button variant="ghost" size="sm" icon={showAdd ? x : plus} onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? t('common.cancel') : t('people.addPerson')}
        </Button>
      </div>

      {/* Add Person Form */}
      {showAdd && (
        <div className="people-page__add-form">
          <div className="people-page__add-form-fields">
            <Input
              size="md"
              variant="outline"
              placeholder={t('people.namePlaceholder')}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <Input
              size="md"
              variant="outline"
              placeholder={t('people.keyPlaceholder')}
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              style={{ fontFamily: 'var(--font-mono)' }}
            />
          </div>
          {projects.length > 0 && (
            <div className="people-page__add-form-projects">
              <span className="people-page__add-form-label">{t('people.addToProjects')}</span>
              <div className="people-page__project-chips">
                {projects.map((p) => (
                  <button
                    key={p.id}
                    className={`people-page__project-chip ${selectedProjects.has(p.id) ? 'people-page__project-chip--selected' : ''}`}
                    onClick={() => toggleProject(p.id)}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <Button
            variant="primary"
            size="md"
            onClick={handleAdd}
            disabled={!newName.trim() || !newKey.trim()}
          >
            {selectedProjects.size > 0
              ? t('people.addToCount', { count: selectedProjects.size })
              : t('people.addAsContact')}
          </Button>
        </div>
      )}

      <Separator />

      {/* People List */}
      {otherPeople.length === 0 && !loading ? (
        <div className="people-page__empty">
          <Icon icon={users} size="lg" color="currentColor" />
          <span className="people-page__empty-title">{t('people.emptyTitle')}</span>
          <span className="people-page__empty-hint">{t('people.emptyHint')}</span>
        </div>
      ) : (
        <div className="people-page__list">
          {otherPeople.map((person, i) => {
            const initial = person.name.charAt(0).toUpperCase();
            return (
              <div
                key={person.public_key}
                className="people-page__person"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <div className="people-page__person-avatar">{initial}</div>
                <div className="people-page__person-info">
                  <div className="people-page__person-header">
                    <span className="people-page__person-name">{person.name}</span>
                  </div>
                  <div className="people-page__person-key">
                    {person.public_key.slice(0, 32)}...{person.public_key.slice(-8)}
                  </div>
                  {person.projects.length > 0 && (
                    <div className="people-page__person-projects">
                      {person.projects.map((p) => (
                        <span key={p.id} className="people-page__project-pill">
                          {p.name}
                          <button
                            className="people-page__project-pill-remove"
                            onClick={() => handleRemoveFromProject(person.name, p.id, p.name)}
                            title={`Remove from ${p.name}`}
                          >
                            &times;
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  {person.added_at && (
                    <div className="people-page__person-date">
                      {t('people.addedOn', { date: formatDate(person.added_at) })}
                    </div>
                  )}
                </div>
                <div className="people-page__person-actions">
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={link}
                    iconOnly
                    onClick={() => handleSharePerson(person.name, person.public_key)}
                    aria-label={t('people.share')}
                  />
                  {(person.source === 'contact' || person.source === 'both') && (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={trash2}
                      iconOnly
                      onClick={() => handleRemove(person.public_key, person.name)}
                      aria-label={t('people.remove')}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
