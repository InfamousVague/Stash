import { test, expect } from '@playwright/test';
import { setupAndUnlock, navigateTo } from './helpers';

test.describe('Settings Page', () => {
  test.beforeEach(async ({ page }) => {
    await setupAndUnlock(page);
    await navigateTo(page, 'Settings');
  });

  test('shows appearance section with dark mode toggle', async ({ page }) => {
    await expect(page.locator('text=Dark Mode')).toBeVisible();
    await expect(page.locator('.toggle').first()).toBeVisible();
  });

  test('shows security section', async ({ page }) => {
    await expect(page.locator('text=Vault Status')).toBeVisible();
    await expect(page.locator('text=Touch ID / Keychain Unlock')).toBeVisible();
  });

  test('shows vault unlocked status', async ({ page }) => {
    await expect(page.locator('text=Unlocked')).toBeVisible();
  });

  test('lock button is visible', async ({ page }) => {
    await expect(page.locator('button:has-text("Lock Now")')).toBeVisible();
  });

  test('shows scanning section', async ({ page }) => {
    await expect(page.locator('text=Scanning')).toBeVisible();
    await expect(page.locator('button:has-text("Re-scan Directories")')).toBeVisible();
  });

  test('shows CLI section', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'CLI' })).toBeVisible();
    // CLI is installed in mock
    await expect(page.locator('.settings-page__section:has-text("CLI") button:has-text("Installed")')).toBeVisible();
  });

  test('shows about section', async ({ page }) => {
    await expect(page.locator('text=About')).toBeVisible();
    await expect(page.locator('.settings-page__about-value:has-text("v0.2.0")')).toBeVisible();
    await expect(page.locator('text=AES-256-GCM')).toBeVisible();
  });

  test('shows CLI command preview block', async ({ page }) => {
    await expect(page.locator('.settings-page__cli-preview')).toBeVisible();
    await expect(page.locator('.settings-page__cli-preview')).toContainText('stash pull');
    await expect(page.locator('.settings-page__cli-preview')).toContainText('stash push');
  });

  test('shows updates section with check button', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Updates' })).toBeVisible();
    // Either "Check for Updates" or "Update Now" depending on state
    const updateBtn = page.locator('button:has-text("Check for Updates"), button:has-text("Update Now")');
    await expect(updateBtn.first()).toBeVisible();
  });

  test('theme toggle changes theme', async ({ page }) => {
    const toggle = page.locator('.toggle').first();
    const htmlEl = page.locator('html');

    // Get initial theme
    const initialTheme = await htmlEl.getAttribute('data-theme');

    // Click the toggle label (the input is hidden)
    await toggle.click();

    // Theme should change
    const newTheme = await htmlEl.getAttribute('data-theme');
    expect(newTheme).not.toBe(initialTheme);
  });
});
