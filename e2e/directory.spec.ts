import { test, expect } from '@playwright/test';
import { setupAndUnlock, navigateTo } from './helpers';

test.describe('API Directory Page', () => {
  test.beforeEach(async ({ page }) => {
    await setupAndUnlock(page);
    await navigateTo(page, 'API Directory');
  });

  test('shows search input', async ({ page }) => {
    await expect(page.locator('.directory-page__search input')).toBeVisible();
  });

  test('shows filter buttons', async ({ page }) => {
    await expect(page.locator('.directory-page__filters button:has-text("All")')).toBeVisible();
    await expect(page.locator('.directory-page__filters button:has-text("AI & ML")')).toBeVisible();
  });

  test('shows service cards', async ({ page }) => {
    await expect(page.locator('.service-card')).toHaveCount(20, { timeout: 5000 });
  });

  test('search filters services', async ({ page }) => {
    await page.fill('.directory-page__search input', 'Stripe');
    // Wait for filtered results to appear
    await expect(page.locator('.service-card__name:has-text("Stripe")').first()).toBeVisible({ timeout: 5000 });
    const count = await page.locator('.service-card').count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(20);
  });

  test('category filter works', async ({ page }) => {
    await page.click('.directory-page__filters button:has-text("Payment")');
    await page.waitForTimeout(300);
    const cards = page.locator('.service-card');
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
  });

  test('show all button expands filters', async ({ page }) => {
    const showAllBtn = page.locator('.directory-page__show-all');
    await expect(showAllBtn).toBeVisible();
    await showAllBtn.click();
    await expect(showAllBtn).toHaveText('Show less');
  });

  test('pagination is visible with many results', async ({ page }) => {
    await expect(page.locator('.directory-page__pagination')).toBeVisible();
    await expect(page.locator('.directory-page__page-info')).toContainText('Page 1');
  });

  test('can navigate to next page', async ({ page }) => {
    await page.click('button:has-text("Next →")');
    await expect(page.locator('.directory-page__page-info')).toContainText('Page 2');
  });

  test('service cards have Get Key button', async ({ page }) => {
    await expect(page.locator('.service-card__footer button:has-text("Get Key")').first()).toBeVisible();
  });
});
