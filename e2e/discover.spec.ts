import { test, expect } from '@playwright/test';
import { setupAndUnlock, navigateTo } from './helpers';

test.describe('Discover Page', () => {
  test.beforeEach(async ({ page }) => {
    await setupAndUnlock(page);
    await navigateTo(page, 'Discover');
  });

  test('shows scan button', async ({ page }) => {
    // Button may show "Scanning..." initially due to auto-scan
    const scanBtn = page.locator('button:has-text("Scan"), button:has-text("Scanning")');
    await expect(scanBtn.first()).toBeVisible();
  });

  test('shows discovered projects after scan results load', async ({ page }) => {
    // The mock returns scan results immediately
    await expect(page.locator('.discover-page__card')).toHaveCount(2, { timeout: 5000 });
  });

  test('shows project names in cards', async ({ page }) => {
    await expect(page.locator('.discover-page__card-name:has-text("nextjs-app")')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.discover-page__card-name:has-text("unimported-project")')).toBeVisible();
  });

  test('shows framework badges', async ({ page }) => {
    await page.waitForSelector('.discover-page__card', { timeout: 5000 });
    await expect(page.locator('.discover-page__card-header:has-text("next")')).toBeVisible();
  });

  test('shows env file names', async ({ page }) => {
    await page.waitForSelector('.discover-page__card', { timeout: 5000 });
    await expect(page.locator('.discover-page__card-file').first()).toBeVisible();
  });

  test('imported projects show imported badge', async ({ page }) => {
    await page.waitForSelector('.discover-page__card', { timeout: 5000 });
    // nextjs-app matches a mock project, so it should show imported
    const importedCards = page.locator('.discover-page__card--imported');
    await expect(importedCards).toHaveCount(1);
  });
});
