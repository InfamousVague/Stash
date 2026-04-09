import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import { useContacts } from '../hooks/useContacts';
import { useTeam } from '../hooks/useTeam';
import { useToastContext } from '../contexts/ToastContext';
import './ContactsPage.css';

interface ContactsPageProps {
  pendingContact?: { name: string; key: string } | null;
  onPendingHandled?: () => void;
}

export function ContactsPage({ pendingContact, onPendingHandled }: ContactsPageProps) {
  const { t } = useTranslation();
  const { contacts, loading, refresh, addContact, removeContact, getShareLink } = useContacts();
  const team = useTeam();
  const toast = useToastContext();

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newKey, setNewKey] = useState('');

  useEffect(() => {
    team.loadKey();
    refresh();
  }, [refresh]);

  // Auto-fill form when a pending contact arrives via deep link
  useEffect(() => {
    if (pendingContact && pendingContact.name && pendingContact.key) {
      setNewName(pendingContact.name);
      setNewKey(pendingContact.key);
      setShowAdd(true);
    }
  }, [pendingContact]);

  const handleGenerateKey = async () => {
    await team.generateKey();
    toast.success(t('developers.keypairGenerated'));
    refresh();
  };

  const handleCopyKey = () => {
    navigator.clipboard.writeText(team.publicKey);
    toast.info(t('contacts.keyCopied'));
  };

  const handleShareLink = async () => {
    try {
      const link = await getShareLink('Me', team.publicKey);
      await navigator.clipboard.writeText(link);
      toast.info(t('contacts.linkCopied'));
    } catch (e) {
      toast.error(String(e));
    }
  };

  const handleAddContact = async () => {
    if (!newName.trim() || !newKey.trim()) return;
    try {
      await addContact(newName.trim(), newKey.trim());
      toast.success(t('contacts.added', { name: newName.trim() }));
      setNewName('');
      setNewKey('');
      setShowAdd(false);
      if (pendingContact) onPendingHandled?.();
      refresh();
    } catch (e) {
      toast.error(String(e));
    }
  };

  const handleRemoveContact = async (publicKey: string, name: string) => {
    try {
      await removeContact(publicKey);
      toast.info(t('contacts.removed', { name }));
      refresh();
    } catch (e) {
      toast.error(String(e));
    }
  };

  const handleShareContact = async (name: string, publicKey: string) => {
    try {
      const shareLink = await getShareLink(name, publicKey);
      await navigator.clipboard.writeText(shareLink);
      toast.info(t('contacts.linkCopied'));
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

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="contacts-page">
      {/* Your Identity */}
      <div className="contacts-page__identity">
        {team.publicKey ? (
          <div className="contacts-page__identity-card">
            <span className="contacts-page__identity-status contacts-page__identity-status--active" />
            <div className="contacts-page__identity-info">
              <span className="contacts-page__identity-label">{t('contacts.yourIdentity')}</span>
              <span className="contacts-page__identity-sublabel">{t('contacts.shareYourKey')}</span>
              <span className="contacts-page__identity-key">
                {team.publicKey.slice(0, 32)}...{team.publicKey.slice(-8)}
              </span>
            </div>
            <div className="contacts-page__identity-actions">
              <Button variant="ghost" size="sm" icon={copy} onClick={handleCopyKey}>
                {t('contacts.copyKey')}
              </Button>
              <Button variant="ghost" size="sm" icon={link} onClick={handleShareLink}>
                {t('contacts.shareLink')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="contacts-page__identity-hint">
            <Icon icon={key} size="lg" color="currentColor" />
            <p>{t('contacts.generateFirst')}</p>
            <Button variant="primary" size="md" onClick={handleGenerateKey}>
              {t('contacts.generateKeypair')}
            </Button>
          </div>
        )}
      </div>

      {/* Pending deep-link contact banner */}
      {pendingContact && pendingContact.name && pendingContact.key && (
        <div className="contacts-page__pending">
          <span className="contacts-page__pending-title">{t('contacts.pendingTitle')}</span>
          <span className="contacts-page__pending-desc">
            {t('contacts.pendingDesc', { name: pendingContact.name })}
          </span>
          <div className="contacts-page__pending-actions">
            <Button variant="primary" size="sm" onClick={handleAddContact}>
              {t('contacts.pendingConfirm')}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleDismissPending}>
              {t('contacts.pendingDismiss')}
            </Button>
          </div>
        </div>
      )}

      {/* Contacts Header */}
      <div className="contacts-page__section-header">
        <span className="contacts-page__section-title">
          {t('contacts.addContact')}
          {contacts.length > 0 && (
            <Badge variant="subtle" size="sm" color="neutral" style={{ marginLeft: 8 }}>
              {contacts.length}
            </Badge>
          )}
        </span>
        <Button variant="ghost" size="sm" icon={showAdd ? x : plus} onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? t('contacts.cancel') : t('contacts.addContact')}
        </Button>
      </div>

      {/* Add Contact Form */}
      {showAdd && (
        <div className="contacts-page__add-form">
          <div className="contacts-page__add-form-fields">
            <Input
              size="md"
              variant="outline"
              placeholder={t('contacts.namePlaceholder')}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <Input
              size="md"
              variant="outline"
              placeholder={t('contacts.keyPlaceholder')}
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              style={{ fontFamily: 'var(--font-mono)' }}
            />
          </div>
          <Button
            variant="primary"
            size="md"
            onClick={handleAddContact}
            disabled={!newName.trim() || !newKey.trim()}
          >
            {t('contacts.add')}
          </Button>
        </div>
      )}

      <Separator />

      {/* Contacts List */}
      {contacts.length === 0 && !loading ? (
        <div className="contacts-page__empty">
          <Icon icon={users} size="lg" color="currentColor" />
          <span className="contacts-page__empty-title">{t('contacts.emptyTitle')}</span>
          <span className="contacts-page__empty-hint">{t('contacts.emptyHint')}</span>
        </div>
      ) : (
        <div className="contacts-page__list">
          {contacts.map((contact, i) => {
            const initial = contact.name.charAt(0).toUpperCase();
            return (
              <div
                key={contact.public_key}
                className="contacts-page__contact"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <div className="contacts-page__contact-avatar">{initial}</div>
                <div className="contacts-page__contact-info">
                  <div className="contacts-page__contact-header">
                    <span className="contacts-page__contact-name">{contact.name}</span>
                  </div>
                  <div className="contacts-page__contact-key">
                    {contact.public_key.slice(0, 32)}...{contact.public_key.slice(-8)}
                  </div>
                  <div className="contacts-page__contact-date">
                    {t('contacts.addedOn', { date: formatDate(contact.added_at) })}
                  </div>
                </div>
                <div className="contacts-page__contact-actions">
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={link}
                    onClick={() => handleShareContact(contact.name, contact.public_key)}
                  >
                    {t('contacts.share')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={trash2}
                    onClick={() => handleRemoveContact(contact.public_key, contact.name)}
                  >
                    {t('contacts.remove')}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
