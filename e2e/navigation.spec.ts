import { test, expect } from '@playwright/test';
import { setupAndUnlock, navigateTo } from './helpers';

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await setupAndUnlock(page);
  });

  test('sidebar shows all nav items', async ({ page }) => {
    // 8 nav items + 2 footer items (Help, Lock) = 10 total .stash__nav-item elements
    await expect(page.locator('.stash__nav-item')).toHaveCount(10);
    await expect(page.locator('.stash__nav-item:has-text("Vaults")')).toBeVisible();
    await expect(page.locator('.stash__nav-item:has-text("Discover")')).toBeVisible();
    await expect(page.locator('.stash__nav-item:has-text("API Directory")')).toBeVisible();
    await expect(page.locator('.stash__nav-item:has-text("Key Health")')).toBeVisible();
    await expect(page.locator('.stash__nav-item:has-text("Teams")')).toBeVisible();
    await expect(page.locator('.stash__nav-item:has-text("Contacts")')).toBeVisible();
    await expect(page.locator('.stash__nav-item:has-text("Settings")')).toBeVisible();
    await expect(page.locator('.stash__nav-item:has-text("Help")')).toBeVisible();
    await expect(page.locator('.stash__nav-item:has-text("Lock")')).toBeVisible();
  });

  test('defaults to Vaults page', async ({ page }) => {
    await expect(page.locator('.stash__nav-item--active')).toHaveText('Vaults');
  });

  test('navigates to Discover page', async ({ page }) => {
    await navigateTo(page, 'Discover');
    await expect(page.locator('.stash__nav-item--active')).toHaveText('Discover');
  });

  test('navigates to API Directory page', async ({ page }) => {
    await navigateTo(page, 'API Directory');
    await expect(page.locator('.stash__nav-item--active')).toHaveText('API Directory');
  });

  test('navigates to Key Health page', async ({ page }) => {
    await navigateTo(page, 'Key Health');
    await expect(page.locator('.stash__nav-item--active')).toHaveText('Key Health');
  });

  test('navigates to Teams page', async ({ page }) => {
    await navigateTo(page, 'Teams');
    await expect(page.locator('.stash__nav-item--active')).toHaveText('Teams');
  });

  test('navigates to Contacts page', async ({ page }) => {
    await navigateTo(page, 'Contacts');
    await expect(page.locator('.stash__nav-item--active')).toHaveText('Contacts');
  });

  test('navigates to Settings page', async ({ page }) => {
    await navigateTo(page, 'Settings');
    await expect(page.locator('.stash__nav-item--active')).toHaveText('Settings');
  });

  test('active nav item has active class', async ({ page }) => {
    await navigateTo(page, 'Settings');
    await expect(page.locator('.stash__nav-item--active')).toHaveText('Settings');
  });

  test('lock button is visible in sidebar footer', async ({ page }) => {
    await expect(page.locator('.stash__sidebar-footer .stash__nav-item:has-text("Lock")')).toBeVisible();
  });

  test('help button is visible in sidebar footer', async ({ page }) => {
    await expect(page.locator('.stash__sidebar-footer .stash__nav-item:has-text("Help")')).toBeVisible();
  });
});
