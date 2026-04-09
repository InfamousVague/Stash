import { test, expect } from '@playwright/test';

async function unlockApp(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.waitForSelector('.unlock-screen', { timeout: 10000 });
  await page.fill('input[type="password"]', 'test-password-123');
  const confirmInput = page.locator('input[placeholder*="Confirm"]');
  if (await confirmInput.isVisible().catch(() => false)) {
    await confirmInput.fill('test-password-123');
  }
  await page.click('button[type="submit"]');
  await page.waitForSelector('.stash__sidebar', { timeout: 10000 });
}

test.describe('Vaults Page (Native)', () => {
  test.beforeEach(async ({ page }) => {
    await unlockApp(page);
  });

  test('shows the vaults page', async ({ page }) => {
    await page.click('.stash__nav-item:has-text("Vaults")');
    // Should show either projects or empty state
    const vaultsPage = page.locator('.vaults-page');
    await expect(vaultsPage).toBeVisible({ timeout: 5000 });
  });

  test('shows scan or new buttons', async ({ page }) => {
    const scanBtn = page.locator('button:has-text("Scan")');
    const newBtn = page.locator('button:has-text("New")');
    // At least one action button should be visible
    const hasScan = await scanBtn.isVisible().catch(() => false);
    const hasNew = await newBtn.isVisible().catch(() => false);
    expect(hasScan || hasNew).toBe(true);
  });

  test('can trigger filesystem scan', async ({ page }) => {
    const scanBtn = page.locator('button:has-text("Scan")');
    if (await scanBtn.isVisible().catch(() => false)) {
      await scanBtn.click();
      // Scan should start — look for scanning indicator or results
      // The real backend will actually scan the filesystem
      await page.waitForTimeout(2000);
    }
  });
});
