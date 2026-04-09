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

test.describe('Navigation (Native)', () => {
  test.beforeEach(async ({ page }) => {
    await unlockApp(page);
  });

  test('shows sidebar with all nav items', async ({ page }) => {
    // 8 nav items + Help + Lock = 10
    await expect(page.locator('.stash__nav-item')).toHaveCount(10);
  });

  test('defaults to Vaults page', async ({ page }) => {
    await expect(page.locator('.stash__nav-item--active')).toHaveText('Vaults');
  });

  test('can navigate to each page', async ({ page }) => {
    const pages = ['Discover', 'API Directory', 'Saved Keys', 'Key Health', 'Teams', 'Contacts', 'Settings'];
    for (const label of pages) {
      await page.click(`.stash__nav-item:has-text("${label}")`);
      await expect(page.locator('.stash__nav-item--active')).toHaveText(label);
    }
  });

  test('can lock and return to unlock screen', async ({ page }) => {
    await page.click('.stash__sidebar-footer .stash__nav-item:has-text("Lock")');
    await expect(page.locator('.unlock-screen')).toBeVisible({ timeout: 5000 });
  });
});
