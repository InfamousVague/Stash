import { test, expect } from '@playwright/test';
import { setupMocks } from './helpers';

test.describe('Unlock Screen', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page);
  });

  test('shows unlock screen on load', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.unlock-screen')).toBeVisible();
    await expect(page.locator('.unlock-screen__title')).toHaveText('Unlock Stash');
  });

  test('shows password input and unlock button', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toHaveText('Unlock');
  });

  test('unlocks with correct password', async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="password"]', 'my-password');
    await page.click('button[type="submit"]');
    // Should see main app sidebar
    await expect(page.locator('.stash__sidebar')).toBeVisible({ timeout: 5000 });
  });

  test('shows error with wrong password', async ({ page }) => {
    await page.goto('/');
    await page.fill('input[type="password"]', 'wrong');
    await page.click('button[type="submit"]');
    await expect(page.locator('.unlock-screen__error')).toBeVisible({ timeout: 3000 });
  });
});
