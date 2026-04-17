import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { Dialog } from '@base/primitives/dialog';
import '@base/primitives/dialog/dialog.css';
import { Button } from '@base/primitives/button';
import '@base/primitives/button/button.css';
import { Input } from '@base/primitives/input';
import '@base/primitives/input/input.css';
import { Checkbox } from '@base/primitives/checkbox';
import '@base/primitives/checkbox/checkbox.css';
import { check } from '@base/primitives/icon/icons/check';
import { arrowRight } from '@base/primitives/icon/icons/arrow-right';
import { arrowLeft } from '@base/primitives/icon/icons/arrow-left';
import { plus } from '@base/primitives/icon/icons/plus';
import { useToastContext } from '../contexts/ToastContext';
import type { Contact } from '../types';
import './ShareWizard.css';

interface ShareWizardProps {
  open: boolean;
  projectId: string;
  projectName: string;
  onClose: () => void;
  onComplete: () => void;
}

interface PendingMember {
  name: string;
  public_key: string;
}

export function ShareWizard({ open, projectId, projectName, onClose, onComplete }: ShareWizardProps) {
  const { t } = useTranslation();
  const toast = useToastContext();
  const [step, setStep] = useState(0);
  const [myPublicKey, setMyPublicKey] = useState('');
  const [myName, setMyName] = useState('');
  const [generating, setGenerating] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [members, setMembers] = useState<PendingMember[]>([]);
  const [newName, setNewName] = useState('');
  const [newKey, setNewKey] = useState('');
  const [pushing, setPushing] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setMembers([]);
    // Load identity
    invoke<string>('get_public_key').then(setMyPublicKey).catch(() => setMyPublicKey(''));
    invoke<string>('get_git_username').then(setMyName).catch(() => setMyName(''));
    invoke<Contact[]>('list_contacts').then(setContacts).catch(() => setContacts([]));
  }, [open]);

  const handleGenerateKey = async () => {
    setGenerating(true);
    try {
      const key = await invoke<string>('generate_team_key');
      setMyPublicKey(key);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setGenerating(false);
    }
  };

  const handleAddMember = () => {
    const name = newName.trim();
    const key = newKey.trim();
    if (!name || !key) return;
    if (members.some((m) => m.public_key === key)) return;
    setMembers((prev) => [...prev, { name, public_key: key }]);
    setNewName('');
    setNewKey('');
  };

  const handleToggleContact = (contact: Contact) => {
    setMembers((prev) => {
      if (prev.some((m) => m.public_key === contact.public_key)) {
        return prev.filter((m) => m.public_key !== contact.public_key);
      }
      return [...prev, { name: contact.name, public_key: contact.public_key }];
    });
  };

  const handleRemoveMember = (key: string) => {
    setMembers((prev) => prev.filter((m) => m.public_key !== key));
  };

  const handleComplete = async () => {
    setPushing(true);
    try {
      // Step 1: Initialize lock if not already
      await invoke('init_lock', { projectId });

      // Step 2: Add all members
      for (const member of members) {
        try {
          await invoke('add_team_member', {
            projectId,
            name: member.name,
            publicKey: member.public_key,
          });
        } catch {
          // May already exist — continue
        }
      }

      // Step 3: Push
      await invoke('push_lock', { projectId });

      toast.success(t('shareWizard.success', { project: projectName }));
      onComplete();
      onClose();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setPushing(false);
    }
  };

  const canProceedStep0 = myPublicKey && myName;

  const stepTitles = [
    t('shareWizard.step1Title'),
    t('shareWizard.step2Title'),
    t('shareWizard.step3Title'),
  ];

  const stepDescriptions = [
    t('shareWizard.step1Desc'),
    t('shareWizard.step2Desc'),
    t('shareWizard.step3Desc'),
  ];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={stepTitles[step]}
      description={stepDescriptions[step]}
      size="md"
    >
      <div className="share-wizard__body">
        {/* Step indicator */}
        <div className="share-wizard__step-indicator">
          {[0, 1, 2].map((s) => (
            <div
              key={s}
              className={`share-wizard__step-dot ${s === step ? 'share-wizard__step-dot--active' : ''} ${s < step ? 'share-wizard__step-dot--done' : ''}`}
            />
          ))}
        </div>

        {/* Step 0: Identity */}
        {step === 0 && (
          <>
            {myPublicKey ? (
              <div className="share-wizard__identity-card">
                <span className="share-wizard__identity-status" />
                <div className="share-wizard__identity-info">
                  <span className="share-wizard__identity-label">{myName || t('shareWizard.you')}</span>
                  <span className="share-wizard__identity-key">
                    {myPublicKey.slice(0, 32)}...{myPublicKey.slice(-8)}
                  </span>
                </div>
              </div>
            ) : (
              <Button
                variant="primary"
                size="md"
                onClick={handleGenerateKey}
                disabled={generating}
              >
                {generating ? t('shareWizard.generating') : t('shareWizard.generateKeypair')}
              </Button>
            )}
            {!myName && myPublicKey && (
              <Input
                size="md"
                variant="outline"
                placeholder={t('shareWizard.namePlaceholder')}
                value={myName}
                onChange={(e) => setMyName(e.target.value)}
              />
            )}
          </>
        )}

        {/* Step 1: Add Members */}
        {step === 1 && (
          <>
            {contacts.length > 0 && (
              <div className="share-wizard__known-people">
                <span className="share-wizard__known-label">{t('shareWizard.knownPeople')}</span>
                {contacts
                  .filter((c) => c.public_key !== myPublicKey)
                  .map((c) => {
                    const isSelected = members.some((m) => m.public_key === c.public_key);
                    return (
                      <div
                        key={c.public_key}
                        className={`share-wizard__known-person ${isSelected ? 'share-wizard__known-person--selected' : ''}`}
                        onClick={() => handleToggleContact(c)}
                      >
                        <Checkbox checked={isSelected} onChange={() => {}} />
                        <span>{c.name}</span>
                        <span className="share-wizard__known-person-key">
                          {c.public_key.slice(0, 20)}...
                        </span>
                      </div>
                    );
                  })}
              </div>
            )}

            {members.length > 0 && (
              <div className="share-wizard__member-list">
                {members.map((m) => (
                  <div key={m.public_key} className="share-wizard__member">
                    <span className="share-wizard__member-name">{m.name}</span>
                    <span className="share-wizard__member-key">{m.public_key.slice(0, 24)}...</span>
                    <button className="share-wizard__member-remove" onClick={() => handleRemoveMember(m.public_key)}>
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="share-wizard__add-member">
              <div className="share-wizard__add-member-fields">
                <Input
                  size="md"
                  variant="outline"
                  placeholder={t('shareWizard.memberName')}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="share-wizard__input-name"
                />
                <Input
                  size="md"
                  variant="outline"
                  placeholder={t('shareWizard.memberKey')}
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  className="share-wizard__input-key"
                />
                <Button
                  variant="ghost"
                  size="md"
                  icon={plus}
                  iconOnly
                  onClick={handleAddMember}
                  disabled={!newName.trim() || !newKey.trim()}
                  aria-label={t('common.add')}
                />
              </div>
            </div>
          </>
        )}

        {/* Step 2: Review & Push */}
        {step === 2 && (
          <div className="share-wizard__summary">
            <div className="share-wizard__summary-item">
              <span className="share-wizard__summary-count">{projectName}</span>
              <span>{t('shareWizard.willBeEncrypted')}</span>
            </div>
            <div className="share-wizard__summary-item">
              <span className="share-wizard__summary-count">{members.length + 1}</span>
              <span>{t('shareWizard.membersWillHaveAccess')}</span>
            </div>
            {members.length > 0 && (
              <div className="share-wizard__member-list">
                {members.map((m) => (
                  <div key={m.public_key} className="share-wizard__member">
                    <span className="share-wizard__member-name">{m.name}</span>
                    <span className="share-wizard__member-key">{m.public_key.slice(0, 24)}...</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="share-wizard__actions">
          {step > 0 && (
            <Button variant="ghost" size="md" icon={arrowLeft} onClick={() => setStep(step - 1)} disabled={pushing}>
              {t('common.back')}
            </Button>
          )}
          <div className="share-wizard__spacer" />
          {step < 2 && (
            <Button
              variant="primary"
              size="md"
              icon={arrowRight}
              onClick={() => setStep(step + 1)}
              disabled={step === 0 && !canProceedStep0}
            >
              {t('shareWizard.next')}
            </Button>
          )}
          {step === 2 && (
            <Button
              variant="primary"
              size="md"
              icon={check}
              onClick={handleComplete}
              disabled={pushing}
            >
              {pushing ? t('shareWizard.sharing') : t('shareWizard.share')}
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
