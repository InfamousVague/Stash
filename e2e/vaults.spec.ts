import { test, expect } from '@playwright/test';
import { setupAndUnlock } from './helpers';

test.describe('Vaults Page', () => {
  test.beforeEach(async ({ page }) => {
    await setupAndUnlock(page);
  });

  test('shows project list in sidebar', async ({ page }) => {
    await expect(page.locator('.vaults-page__project-item')).toHaveCount(2);
    await expect(page.locator('.vaults-page__project-name:has-text("nextjs-app")')).toBeVisible();
    await expect(page.locator('.vaults-page__project-name:has-text("express-api")')).toBeVisible();
  });

  test('selecting a project shows editor', async ({ page }) => {
    await page.click('.vaults-page__project-item:has-text("nextjs-app")');
    await expect(page.locator('.vaults-page__detail-title')).toHaveText('nextjs-app');
    await expect(page.locator('.env-editor')).toBeVisible({ timeout: 3000 });
  });

  test('shows env vars in editor', async ({ page }) => {
    await page.click('.vaults-page__project-item:has-text("nextjs-app")');
    await expect(page.locator('.env-var-row')).toHaveCount(5, { timeout: 3000 });
    await expect(page.locator('.env-var-row__key code:has-text("DATABASE_URL")')).toBeVisible();
    await expect(page.locator('.env-var-row__key code:has-text("API_KEY")')).toBeVisible();
  });

  test('can filter env vars', async ({ page }) => {
    await page.click('.vaults-page__project-item:has-text("nextjs-app")');
    await page.waitForSelector('.env-editor', { timeout: 3000 });
    await page.fill('.env-editor__search input', 'DATABASE');
    await expect(page.locator('.env-var-row')).toHaveCount(1);
    await expect(page.locator('.env-var-row__key code:has-text("DATABASE_URL")')).toBeVisible();
  });

  test('editor tabs are visible', async ({ page }) => {
    await page.click('.vaults-page__project-item:has-text("nextjs-app")');
    await expect(page.locator('.vaults-page__tab:has-text("Editor")')).toBeVisible();
    await expect(page.locator('.vaults-page__tab:has-text("Team")')).toBeVisible();
  });

  test.skip('can switch to Team tab', async ({ page }) => {
    await page.click('.vaults-page__project-item:has-text("nextjs-app")');
    await page.click('.vaults-page__tab:has-text("Team")');
    await expect(page.locator('.team-panel')).toBeVisible({ timeout: 5000 });
  });

  test('new environment button opens wizard', async ({ page }) => {
    // Click the file-plus button next to Projects header
    await page.click('button:has-text("New Environment")');
    await expect(page.locator('.env-wizard')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('.env-wizard__header h2')).toHaveText('New Environment');
  });

  test('wizard has three tabs', async ({ page }) => {
    await page.click('button:has-text("New Environment")');
    await expect(page.locator('.tabs__tab')).toHaveCount(3);
    await expect(page.locator('.tabs__tab:has-text("Templates")')).toBeVisible();
    await expect(page.locator('.tabs__tab:has-text("Services")')).toBeVisible();
    await expect(page.locator('.tabs__tab:has-text("Clone")')).toBeVisible();
  });

  test('wizard back button returns to project view', async ({ page }) => {
    await page.click('button:has-text("New Environment")');
    await expect(page.locator('.env-wizard')).toBeVisible();
    await page.click('.env-wizard__header button[aria-label="Back"]');
    await expect(page.locator('.env-wizard')).not.toBeVisible();
  });

  test('empty state shows when no project selected', async ({ page }) => {
    await expect(page.locator('.vaults-page__detail-empty')).toBeVisible();
  });
});
