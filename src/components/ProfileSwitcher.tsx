import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@base/primitives/button';
import '@base/primitives/button/button.css';
import { Dialog } from '@base/primitives/dialog';
import '@base/primitives/dialog/dialog.css';
import { Input } from '@base/primitives/input';
import '@base/primitives/input/input.css';
import { Checkbox } from '@base/primitives/checkbox';
import '@base/primitives/checkbox/checkbox.css';
import { ColorPicker } from '@base/primitives/color-picker';
import '@base/primitives/color-picker/color-picker.css';
import { plus } from '@base/primitives/icon/icons/plus';
import { x } from '@base/primitives/icon/icons/x';
import { check } from '@base/primitives/icon/icons/check';
import { trash2 } from '@base/primitives/icon/icons/trash-2';
import { getProfileColor, PROFILE_COLOR_PRESETS } from '../data/profile-colors';
import { Tip } from './Tip';
import './ProfileSwitcher.css';

interface ProfileSwitcherProps {
  profiles: string[];
  activeProfile: string;
  customColors?: Record<string, string>;
  onSwitch: (profileName: string) => void;
  onCreate: (name: string, copyValues: boolean, copyFrom?: string) => void;
  onDelete: (name: string) => void;
  onColorChange?: (profileName: string, color: string) => void;
}

export function ProfileSwitcher({
  profiles,
  activeProfile,
  customColors,
  onSwitch,
  onCreate,
  onDelete,
  onColorChange,
}: ProfileSwitcherProps) {
  const { t } = useTranslation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [copyValues, setCopyValues] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [colorPickerProfile, setColorPickerProfile] = useState<string | null>(null);
  const colorPickerRef = useRef<HTMLDivElement>(null);

  // Close color picker on outside click
  useEffect(() => {
    if (!colorPickerProfile) return;
    const handler = (e: MouseEvent) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) {
        setColorPickerProfile(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [colorPickerProfile]);

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) return;
    onCreate(name, copyValues, activeProfile);
    setNewName('');
    setCopyValues(false);
    setDialogOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleCreate();
  };

  return (
    <div className="profile-switcher">
      <label className="profile-switcher__label">{t('profileSwitcher.profile')}</label>
      <div className="profile-switcher__list">
        {profiles.map((p) => {
          const isActive = p === activeProfile;
          const canDelete = p !== 'default' && profiles.length > 1;
          const color = getProfileColor(p, customColors);
          return (
            <div
              key={p}
              className={`profile-switcher__item ${isActive ? 'profile-switcher__item--active' : ''}`}
              style={isActive ? { borderColor: color, background: `color-mix(in srgb, ${color} 8%, transparent)` } : undefined}
            >
              <Tip content={isActive ? t('profileSwitcher.changeColor') : p}>
                <button
                  className="profile-switcher__dot-btn"
                  style={{ backgroundColor: color }}
                  onClick={(e) => {
                    if (isActive && onColorChange) {
                      e.stopPropagation();
                      setColorPickerProfile(colorPickerProfile === p ? null : p);
                    } else if (!isActive) {
                      onSwitch(p);
                    }
                  }}
                  aria-label={isActive ? t('profileSwitcher.changeColor') : `Switch to ${p}`}
                />
              </Tip>
              {colorPickerProfile === p && (
                <div className="profile-switcher__color-popover" ref={colorPickerRef}>
                  <ColorPicker
                    value={color}
                    onChange={(c) => onColorChange?.(p, c)}
                    presets={PROFILE_COLOR_PRESETS}
                    showInput={false}
                    size="sm"
                  />
                </div>
              )}
              <button
                className="profile-switcher__item-name"
                onClick={() => !isActive && onSwitch(p)}
                disabled={isActive}
                style={{ color: isActive ? color : undefined }}
              >
                .env{p !== 'default' ? `.${p}` : ''}
              </button>
              {canDelete && (
                <button
                  className="profile-switcher__item-delete"
                  onClick={() => setConfirmDelete(p)}
                  aria-label={`Delete ${p} profile`}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>
          );
        })}
        <Tip content={t('profileSwitcher.newProfile')}>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            icon={plus}
            onClick={() => setDialogOpen(true)}
            aria-label={t('profileSwitcher.newProfile')}
          />
        </Tip>
      </div>

      {/* Create profile dialog */}
      <Dialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setCopyValues(false); }}
        title={t('profileSwitcher.newProfile')}
        description={t('profileSwitcher.createBasedOn', { profile: activeProfile })}
        size="md"
      >
        <div className="profile-switcher__dialog-body">
          <Input
            size="md"
            variant="outline"
            placeholder={t('profileSwitcher.profileName')}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
          />
          <Checkbox
            checked={copyValues}
            onChange={(e) => setCopyValues(e.target.checked)}
            label={t('profileSwitcher.copyValues')}
          />
          <div className="profile-switcher__dialog-hint">
            {t('profileSwitcher.keysAlwaysCopied')}
          </div>
          <div className="profile-switcher__dialog-actions">
            <Button variant="ghost" size="md" icon={x} onClick={() => { setDialogOpen(false); setCopyValues(false); }}>
              {t('profileSwitcher.cancel')}
            </Button>
            <Button variant="primary" size="md" icon={check} onClick={handleCreate} disabled={!newName.trim()}>
              {t('profileSwitcher.create')}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title={t('profileSwitcher.deleteProfile')}
        description={t('profileSwitcher.deleteConfirm', { profile: confirmDelete })}
        size="sm"
      >
        <div className="profile-switcher__dialog-body">
          <div className="profile-switcher__dialog-actions">
            <Button variant="ghost" size="md" icon={x} onClick={() => setConfirmDelete(null)}>
              {t('profileSwitcher.cancel')}
            </Button>
            <Button
              variant="primary"
              size="md"
              icon={trash2}
              onClick={() => {
                if (confirmDelete) onDelete(confirmDelete);
                setConfirmDelete(null);
              }}
            >
              {t('profileSwitcher.delete')}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
