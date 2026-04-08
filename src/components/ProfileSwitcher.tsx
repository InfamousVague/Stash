import { useState } from 'react';
import { Select } from '@base/primitives/select';
import '@base/primitives/select/select.css';
import { Button } from '@base/primitives/button';
import '@base/primitives/button/button.css';
import { Dialog } from '@base/primitives/dialog';
import '@base/primitives/dialog/dialog.css';
import { Input } from '@base/primitives/input';
import '@base/primitives/input/input.css';
import { plus } from '@base/primitives/icon/icons/plus';
import './ProfileSwitcher.css';

interface ProfileSwitcherProps {
  profiles: string[];
  activeProfile: string;
  onSwitch: (profileName: string) => void;
  onCreate: (name: string, copyFrom?: string) => void;
}

export function ProfileSwitcher({ profiles, activeProfile, onSwitch, onCreate }: ProfileSwitcherProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) return;
    onCreate(name, activeProfile);
    setNewName('');
    setDialogOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleCreate();
  };

  return (
    <div className="profile-switcher">
      <label className="profile-switcher__label">Profile</label>
      <div className="profile-switcher__controls">
        <Select
          size="md"
          variant="outline"
          value={activeProfile}
          onChange={(e) => onSwitch(e.target.value)}
        >
          {profiles.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
        <Button
          variant="ghost"
          size="md"
          iconOnly
          icon={plus}
          onClick={() => setDialogOpen(true)}
          aria-label="New profile"
        />
      </div>

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title="New Profile"
        description={`Create a new profile based on "${activeProfile}"`}
        size="md"
      >
        <div className="profile-switcher__dialog-body">
          <Input
            size="md"
            variant="outline"
            placeholder="Profile name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
          />
          <div className="profile-switcher__dialog-actions">
            <Button variant="ghost" size="md" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="md" onClick={handleCreate} disabled={!newName.trim()}>
              Create
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
