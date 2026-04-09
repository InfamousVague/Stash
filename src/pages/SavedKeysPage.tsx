import { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@base/primitives/button';
import '@base/primitives/button/button.css';
import { Input } from '@base/primitives/input';
import '@base/primitives/input/input.css';
import { Icon } from '@base/primitives/icon';
import '@base/primitives/icon/icon.css';
import { Separator } from '@base/primitives/separator';
import '@base/primitives/separator/separator.css';
import { Badge } from '@base/primitives/badge';
import '@base/primitives/badge/badge.css';
import { key } from '@base/primitives/icon/icons/key';
import { plus } from '@base/primitives/icon/icons/plus';
import { x } from '@base/primitives/icon/icons/x';
import { trash2 } from '@base/primitives/icon/icons/trash-2';
import { copy } from '@base/primitives/icon/icons/copy';
import { eye } from '@base/primitives/icon/icons/eye';
import { eyeOff } from '@base/primitives/icon/icons/eye-off';
import { search } from '@base/primitives/icon/icons/search';
import { externalLink } from '@base/primitives/icon/icons/external-link';
import { useSavedKeys, type SavedKey } from '../hooks/useSavedKeys';
import { useToastContext } from '../contexts/ToastContext';
import catalog from '../data/api-catalog.json';
import './SavedKeysPage.css';

interface CatalogService {
  id: string;
  name: string;
  category: string;
  description: string;
  envKeys: string[];
  portalUrl: string;
}

interface SavedKeysPageProps {
  pendingImport?: { service: string; envKey: string } | null;
  onPendingHandled?: () => void;
}

export function SavedKeysPage({ pendingImport, onPendingHandled }: SavedKeysPageProps) {
  const { t } = useTranslation();
  const { keys, loading, refresh, addKey, updateKey, deleteKey } = useSavedKeys();
  const toast = useToastContext();

  const [searchQuery, setSearchQuery] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Add form state
  const [serviceQuery, setServiceQuery] = useState('');
  const [selectedService, setSelectedService] = useState<CatalogService | null>(null);
  const [envKeyName, setEnvKeyName] = useState('');
  const [keyValue, setKeyValue] = useState('');
  const [notes, setNotes] = useState('');
  const [showServiceDropdown, setShowServiceDropdown] = useState(false);

  const services = catalog as CatalogService[];

  const filteredServices = useMemo(() => {
    if (!serviceQuery.trim()) return services.slice(0, 20);
    const q = serviceQuery.toLowerCase();
    return services.filter((s) => s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q)).slice(0, 20);
  }, [serviceQuery, services]);

  // Group keys by service
  const grouped = useMemo(() => {
    const q = searchQuery.toLowerCase();
    const filtered = q
      ? keys.filter(
          (k) =>
            k.service_name.toLowerCase().includes(q) ||
            k.env_key.toLowerCase().includes(q) ||
            k.notes.toLowerCase().includes(q)
        )
      : keys;

    const groups: Record<string, SavedKey[]> = {};
    for (const k of filtered) {
      const groupKey = k.service_id || k.service_name;
      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push(k);
    }
    return Object.entries(groups).sort(([, a], [, b]) => a[0].service_name.localeCompare(b[0].service_name));
  }, [keys, searchQuery]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Handle pending import from deep link
  useEffect(() => {
    if (pendingImport && pendingImport.service) {
      const found = services.find(
        (s) => s.id === pendingImport.service || s.name.toLowerCase() === pendingImport.service.toLowerCase()
      );
      if (found) {
        setSelectedService(found);
        setServiceQuery(found.name);
      } else {
        setServiceQuery(pendingImport.service);
      }
      if (pendingImport.envKey) {
        setEnvKeyName(pendingImport.envKey);
      }
      setShowAdd(true);
    }
  }, [pendingImport, services]);

  const handleSelectService = (svc: CatalogService) => {
    setSelectedService(svc);
    setServiceQuery(svc.name);
    setShowServiceDropdown(false);
    // Pre-fill the first env key if none set
    if (!envKeyName && svc.envKeys.length > 0) {
      setEnvKeyName(svc.envKeys[0]);
    }
  };

  const handleAddKey = async () => {
    const serviceName = selectedService?.name || serviceQuery.trim();
    const serviceId = selectedService?.id || serviceQuery.trim().toLowerCase().replace(/\s+/g, '-');
    if (!serviceName || !envKeyName.trim() || !keyValue.trim()) return;
    try {
      await addKey(serviceId, serviceName, envKeyName.trim(), keyValue.trim(), notes.trim());
      toast.success(t('savedKeys.saved', { key: envKeyName.trim(), service: serviceName }));
      resetAddForm();
      if (pendingImport) onPendingHandled?.();
      refresh();
    } catch (e) {
      toast.error(String(e));
    }
  };

  const resetAddForm = () => {
    setShowAdd(false);
    setSelectedService(null);
    setServiceQuery('');
    setEnvKeyName('');
    setKeyValue('');
    setNotes('');
    setShowServiceDropdown(false);
  };

  const handleCopy = async (savedKey: SavedKey) => {
    try {
      await navigator.clipboard.writeText(savedKey.value);
      toast.info(t('savedKeys.copied'));
    } catch (e) {
      toast.error(String(e));
    }
  };

  const toggleReveal = (id: string) => {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startEdit = (savedKey: SavedKey) => {
    setEditingId(savedKey.id);
    setEditValue(savedKey.value);
    setEditNotes(savedKey.notes);
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    try {
      await updateKey(editingId, editValue, editNotes);
      toast.success(t('savedKeys.updated'));
      setEditingId(null);
      refresh();
    } catch (e) {
      toast.error(String(e));
    }
  };

  const handleDelete = async (id: string, envKey: string) => {
    try {
      await deleteKey(id);
      toast.info(t('savedKeys.deleted', { key: envKey }));
      setDeleteConfirmId(null);
      refresh();
    } catch (e) {
      toast.error(String(e));
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="saved-keys-page">
      {/* Toolbar */}
      <div className="saved-keys-page__toolbar">
        <div className="saved-keys-page__search">
          <Input
            size="md"
            variant="outline"
            iconLeft={search}
            placeholder={t('savedKeys.search')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Button
          variant="ghost"
          size="sm"
          icon={showAdd ? x : plus}
          onClick={() => {
            if (showAdd) resetAddForm();
            else setShowAdd(true);
          }}
        >
          {showAdd ? t('savedKeys.cancel') : t('savedKeys.addKey')}
        </Button>
      </div>

      {/* Add Key Form */}
      {showAdd && (
        <div className="saved-keys-page__add-form">
          <div className="saved-keys-page__add-form-fields">
            <label className="saved-keys-page__form-label">{t('savedKeys.service')}</label>
            <div className="saved-keys-page__service-select">
              <Input
                size="md"
                variant="outline"
                placeholder={t('savedKeys.selectService')}
                value={serviceQuery}
                onChange={(e) => {
                  setServiceQuery(e.target.value);
                  setSelectedService(null);
                  setShowServiceDropdown(true);
                }}
                onFocus={() => setShowServiceDropdown(true)}
              />
              {showServiceDropdown && filteredServices.length > 0 && (
                <div className="saved-keys-page__service-dropdown">
                  {filteredServices.map((svc) => (
                    <button
                      key={svc.id}
                      className="saved-keys-page__service-option"
                      onClick={() => handleSelectService(svc)}
                    >
                      <span className="saved-keys-page__service-option-name">{svc.name}</span>
                      <span className="saved-keys-page__service-option-cat">{svc.category}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selectedService && selectedService.envKeys.length > 1 && (
              <div className="saved-keys-page__env-key-chips">
                {selectedService.envKeys.map((ek) => (
                  <button
                    key={ek}
                    className={`saved-keys-page__env-key-chip ${envKeyName === ek ? 'saved-keys-page__env-key-chip--active' : ''}`}
                    onClick={() => setEnvKeyName(ek)}
                  >
                    {ek}
                  </button>
                ))}
              </div>
            )}

            <label className="saved-keys-page__form-label">{t('savedKeys.envKey')}</label>
            <Input
              size="md"
              variant="outline"
              placeholder={t('savedKeys.envKeyPlaceholder')}
              value={envKeyName}
              onChange={(e) => setEnvKeyName(e.target.value)}
              style={{ fontFamily: 'var(--font-mono)' }}
            />

            <label className="saved-keys-page__form-label">{t('savedKeys.value')}</label>
            <div className="saved-keys-page__value-row">
              <Input
                size="md"
                variant="outline"
                placeholder={t('savedKeys.valuePlaceholder')}
                value={keyValue}
                onChange={(e) => setKeyValue(e.target.value)}
                style={{ fontFamily: 'var(--font-mono)', flex: 1 }}
              />
              {selectedService?.portalUrl && (
                <Button
                  variant="secondary"
                  size="md"
                  icon={externalLink}
                  onClick={() => {
                    const w = window as any;
                    if (w.__TAURI_INTERNALS__) {
                      import('@tauri-apps/plugin-opener').then(({ openUrl }) => openUrl(selectedService!.portalUrl));
                    } else {
                      window.open(selectedService!.portalUrl, '_blank');
                    }
                  }}
                >
                  {t('savedKeys.getKey')}
                </Button>
              )}
            </div>

            <label className="saved-keys-page__form-label">{t('savedKeys.notes')}</label>
            <Input
              size="md"
              variant="outline"
              placeholder={t('savedKeys.notesPlaceholder')}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <Button
            variant="primary"
            size="md"
            onClick={handleAddKey}
            disabled={!serviceQuery.trim() || !envKeyName.trim() || !keyValue.trim()}
          >
            {t('savedKeys.save')}
          </Button>
        </div>
      )}

      <Separator />

      {/* Keys List */}
      {keys.length === 0 && !loading ? (
        <div className="saved-keys-page__empty">
          <Icon icon={key} size="lg" color="currentColor" />
          <span className="saved-keys-page__empty-title">{t('savedKeys.emptyTitle')}</span>
          <span className="saved-keys-page__empty-hint">{t('savedKeys.emptyHint')}</span>
        </div>
      ) : grouped.length === 0 && searchQuery ? (
        <div className="saved-keys-page__empty">
          <span className="saved-keys-page__empty-title">{t('savedKeys.emptyTitle')}</span>
        </div>
      ) : (
        <div className="saved-keys-page__list">
          {grouped.map(([groupKey, groupKeys]) => (
            <div key={groupKey} className="saved-keys-page__group">
              <div className="saved-keys-page__group-header">
                <span>{groupKeys[0].service_name}</span>
                <Badge variant="subtle" size="sm" color="neutral">
                  {groupKeys.length}
                </Badge>
              </div>
              {groupKeys.map((savedKey, i) => (
                <div
                  key={savedKey.id}
                  className="saved-keys-page__item"
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  {editingId === savedKey.id ? (
                    <div className="saved-keys-page__item-edit">
                      <span className="saved-keys-page__item-key">{savedKey.env_key}</span>
                      <Input
                        size="md"
                        variant="outline"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        style={{ fontFamily: 'var(--font-mono)' }}
                      />
                      <Input
                        size="md"
                        variant="outline"
                        placeholder={t('savedKeys.notesPlaceholder')}
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                      />
                      <div className="saved-keys-page__item-edit-actions">
                        <Button variant="primary" size="sm" onClick={handleSaveEdit}>
                          {t('savedKeys.save')}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                          {t('savedKeys.cancel')}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="saved-keys-page__item-info">
                        <span className="saved-keys-page__item-key">{savedKey.env_key}</span>
                        <span className="saved-keys-page__item-value">
                          {revealedIds.has(savedKey.id) ? savedKey.value : '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'}
                        </span>
                        {savedKey.notes && (
                          <span className="saved-keys-page__item-notes">{savedKey.notes}</span>
                        )}
                        <span className="saved-keys-page__item-date">
                          {t('savedKeys.addedOn', { date: formatDate(savedKey.created_at) })}
                        </span>
                      </div>
                      <div className="saved-keys-page__item-actions">
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={revealedIds.has(savedKey.id) ? eyeOff : eye}
                          onClick={() => toggleReveal(savedKey.id)}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={copy}
                          onClick={() => handleCopy(savedKey)}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={key}
                          onClick={() => startEdit(savedKey)}
                        />
                        {deleteConfirmId === savedKey.id ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={trash2}
                            onClick={() => handleDelete(savedKey.id, savedKey.env_key)}
                            style={{ color: 'var(--color-danger)' }}
                          >
                            {t('savedKeys.deleteConfirm')}
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={trash2}
                            onClick={() => setDeleteConfirmId(savedKey.id)}
                          />
                        )}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
