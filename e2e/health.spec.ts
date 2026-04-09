import { test, expect } from '@playwright/test';
import { setupAndUnlock, navigateTo } from './helpers';

test.describe('Key Health Page', () => {
  test.beforeEach(async ({ page }) => {
    await setupAndUnlock(page);
    await navigateTo(page, 'Key Health');
  });

  test('shows summary stat cards', async ({ page }) => {
    await expect(page.locator('.health-page__stat')).toHaveCount(3);
    await expect(page.locator('.health-page__stat-label:has-text("Critical")')).toBeVisible();
    await expect(page.locator('.health-page__stat-label:has-text("Warning")')).toBeVisible();
    await expect(page.locator('.health-page__stat-label:has-text("Info")')).toBeVisible();
  });

  test('shows warning count', async ({ page }) => {
    // Mock has 2 warnings
    const warningCard = page.locator('.health-page__stat:has-text("Warning")');
    await expect(warningCard.locator('.health-page__stat-value')).toHaveText('2');
  });

  test('shows filter buttons', async ({ page }) => {
    await expect(page.locator('.health-page__filters button:has-text("All")')).toBeVisible();
    await expect(page.locator('.health-page__filters button:has-text("Stale")')).toBeVisible();
    await expect(page.locator('.health-page__filters button:has-text("Duplicates")')).toBeVisible();
    await expect(page.locator('.health-page__filters button:has-text("Format")')).toBeVisible();
  });

  test('shows health issues in list', async ({ page }) => {
    await expect(page.locator('.health-page__issue')).toHaveCount(3, { timeout: 5000 });
  });

  test('issue shows key name and project', async ({ page }) => {
    await expect(page.locator('.health-page__issue-key:has-text("API_KEY")')).toBeVisible();
    await expect(page.locator('.health-page__issue-project:has-text("nextjs-app")').first()).toBeVisible();
  });

  test('filter narrows results', async ({ page }) => {
    await page.click('.health-page__filters button:has-text("Stale")');
    await expect(page.locator('.health-page__issue')).toHaveCount(1);
    await expect(page.locator('.health-page__issue-key:has-text("API_KEY")')).toBeVisible();
  });

  test('search filters by key name', async ({ page }) => {
    await page.fill('.health-page__search input', 'PORT');
    await expect(page.locator('.health-page__issue')).toHaveCount(1);
  });

  test('scan git button is visible', async ({ page }) => {
    await expect(page.locator('button:has-text("Scan Git")')).toBeVisible();
  });

  test('refresh button is visible', async ({ page }) => {
    await expect(page.locator('button[aria-label="Refresh"]')).toBeVisible();
  });
});
