import { shieldCheck } from '@base/primitives/icon/icons/shield-check';
import { radar } from '@base/primitives/icon/icons/radar';
import { bookOpen } from '@base/primitives/icon/icons/book-open';
import { settings } from '@base/primitives/icon/icons/settings';
import { activity } from '@base/primitives/icon/icons/activity';
import { users } from '@base/primitives/icon/icons/users';
import { key as keyIcon } from '@base/primitives/icon/icons/key';
import { keyRound } from '@base/primitives/icon/icons/key-round';
import { fingerprint } from '@base/primitives/icon/icons/fingerprint';
import { sparkles } from '@base/primitives/icon/icons/sparkles';

export type Page = 'vaults' | 'discover' | 'directory' | 'savedkeys' | 'health' | 'people' | 'settings';

export const NAV_ITEMS: { page: Page; labelKey: string; icon: string; iconColor: string }[] = [
  { page: 'vaults', labelKey: 'nav.vaults', icon: shieldCheck, iconColor: '#22c55e' },
  { page: 'discover', labelKey: 'nav.discover', icon: radar, iconColor: '#3b82f6' },
  { page: 'directory', labelKey: 'nav.directory', icon: bookOpen, iconColor: '#a78bfa' },
  { page: 'savedkeys', labelKey: 'nav.savedKeys', icon: keyRound, iconColor: '#f97316' },
  { page: 'health', labelKey: 'nav.health', icon: activity, iconColor: '#f59e0b' },
  { page: 'people', labelKey: 'nav.people', icon: users, iconColor: '#06b6d4' },
  { page: 'settings', labelKey: 'nav.settings', icon: settings, iconColor: '#6b7280' },
];

export const APP_TOUR_DEFS: { target: string; titleKey: string; bodyKey: string; icon: string; iconColor: string; placement: 'top' | 'bottom' | 'left' | 'right'; page: string }[] = [
  { target: '.stash__nav', titleKey: 'tour.welcome.title', bodyKey: 'tour.welcome.body', icon: sparkles, iconColor: '#a78bfa', placement: 'right', page: 'vaults' },
  { target: '.vaults-page__list-actions', titleKey: 'tour.vaults.title', bodyKey: 'tour.vaults.body', icon: shieldCheck, iconColor: '#22c55e', placement: 'bottom', page: 'vaults' },
  { target: '.vaults-page__detail-tabs', titleKey: 'tour.editor.title', bodyKey: 'tour.editor.body', icon: keyIcon, iconColor: '#f59e0b', placement: 'bottom', page: 'vaults' },
  { target: '.discover-page__toolbar', titleKey: 'tour.discover.title', bodyKey: 'tour.discover.body', icon: radar, iconColor: '#3b82f6', placement: 'bottom', page: 'discover' },
  { target: '.directory-page__controls', titleKey: 'tour.directory.title', bodyKey: 'tour.directory.body', icon: bookOpen, iconColor: '#a78bfa', placement: 'bottom', page: 'directory' },
  { target: '.health-page__summary', titleKey: 'tour.health.title', bodyKey: 'tour.health.body', icon: activity, iconColor: '#f59e0b', placement: 'bottom', page: 'health' },
  { target: '.people-page__section-header', titleKey: 'tour.team.title', bodyKey: 'tour.team.body', icon: users, iconColor: '#06b6d4', placement: 'right', page: 'people' },
  { target: '.vaults-create-btn', titleKey: 'tour.getStarted.title', bodyKey: 'tour.getStarted.body', icon: fingerprint, iconColor: '#22c55e', placement: 'top', page: 'vaults' },
];
