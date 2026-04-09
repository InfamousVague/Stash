import { test, expect } from '@playwright/test';
import { setupAndUnlock, navigateTo } from './helpers';

test.describe('Contacts Page', () => {
  test.beforeEach(async ({ page }) => {
    await setupAndUnlock(page);
    await navigateTo(page, 'Contacts');
  });

  test('shows identity section', async ({ page }) => {
    // Should show generate keypair hint or identity card
    await expect(page.locator('.contacts-page__identity')).toBeVisible();
  });

  test('shows empty contacts state', async ({ page }) => {
    await expect(page.locator('.contacts-page__empty')).toBeVisible();
  });

  test('can open add contact form', async ({ page }) => {
    await page.click('button:has-text("Add Contact")');
    await expect(page.locator('.contacts-page__add-form')).toBeVisible();
  });

  test('add contact form has name and key inputs', async ({ page }) => {
    await page.click('button:has-text("Add Contact")');
    await expect(page.locator('input[placeholder*="Contact name"]')).toBeVisible();
    await expect(page.locator('input[placeholder*="public key"]')).toBeVisible();
  });

  test('can toggle add form with cancel', async ({ page }) => {
    await page.click('button:has-text("Add Contact")');
    await expect(page.locator('.contacts-page__add-form')).toBeVisible();
    await page.click('button:has-text("Cancel")');
    await expect(page.locator('.contacts-page__add-form')).not.toBeVisible();
  });
});
