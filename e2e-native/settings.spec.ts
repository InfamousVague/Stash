import { test, expect } from '@playwright/test';

async function unlockAndNavigate(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.waitForSelector('.unlock-screen', { timeout: 10000 });
  await page.fill('input[type="password"]', 'test-password-123');
  const confirmInput = page.locator('input[placeholder*="Confirm"]');
  if (await confirmInput.isVisible().catch(() => false)) {
    await confirmInput.fill('test-password-123');
  }
  await page.click('button[type="submit"]');
  await page.waitForSelector('.stash__sidebar', { timeout: 10000 });
  await page.click('.stash__nav-item:has-text("Settings")');
}

test.describe('Settings Page (Native)', () => {
  test.beforeEach(async ({ page }) => {
    await unlockAndNavigate(page);
  });

  test('shows appearance section with working dark mode toggle', async ({ page }) => {
    await expect(page.locator('text=Dark Mode')).toBeVisible();
    const html = page.locator('html');
    const initialTheme = await html.getAttribute('data-theme');
    await page.locator('.toggle').first().click();
    const newTheme = await html.getAttribute('data-theme');
    expect(newTheme).not.toBe(initialTheme);
  });

  test('shows security section with real vault status', async ({ page }) => {
    await expect(page.locator('text=Vault Status')).toBeVisible();
    // Should be unlocked since we just unlocked
    await expect(page.locator('text=Unlocked')).toBeVisible();
    await expect(page.locator('button:has-text("Lock Now")')).toBeVisible();
  });

  test('shows CLI section with preview', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'CLI' })).toBeVisible();
    const cliPreview = page.locator('.settings-page__cli-preview');
    await expect(cliPreview).toBeVisible();
    await expect(cliPreview).toContainText('stash pull');
  });

  test('shows about section', async ({ page }) => {
    await expect(page.locator('text=AES-256-GCM')).toBeVisible();
  });
});
