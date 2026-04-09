import { test, expect } from '@playwright/test';

test.describe('Unlock Screen (Native)', () => {
  test('shows unlock screen on launch', async ({ page }) => {
    await page.goto('/');
    const unlockScreen = page.locator('.unlock-screen');
    await expect(unlockScreen).toBeVisible({ timeout: 10000 });
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('can create vault and unlock', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.unlock-screen', { timeout: 10000 });

    await page.fill('input[type="password"]', 'test-password-123');

    // If first run, fill confirm password
    const confirmInput = page.locator('input[placeholder*="Confirm"]');
    if (await confirmInput.isVisible().catch(() => false)) {
      await confirmInput.fill('test-password-123');
    }

    await page.click('button[type="submit"]');

    // Should see the main app sidebar (real Tauri backend)
    await expect(page.locator('.stash__sidebar')).toBeVisible({ timeout: 10000 });
  });
});
