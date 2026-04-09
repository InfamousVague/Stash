# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: vaults.spec.ts >> Vaults Page (Native) >> can trigger filesystem scan
- Location: e2e-native/vaults.spec.ts:36:3

# Error details

```
Error: page.waitForSelector: Target page, context or browser has been closed
Call log:
  - waiting for locator('.stash__sidebar') to be visible

```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | async function unlockApp(page: import('@playwright/test').Page) {
  4  |   await page.goto('/');
  5  |   await page.waitForSelector('.unlock-screen', { timeout: 10000 });
  6  |   await page.fill('input[type="password"]', 'test-password-123');
  7  |   const confirmInput = page.locator('input[placeholder*="Confirm"]');
  8  |   if (await confirmInput.isVisible().catch(() => false)) {
  9  |     await confirmInput.fill('test-password-123');
  10 |   }
  11 |   await page.click('button[type="submit"]');
> 12 |   await page.waitForSelector('.stash__sidebar', { timeout: 10000 });
     |              ^ Error: page.waitForSelector: Target page, context or browser has been closed
  13 | }
  14 | 
  15 | test.describe('Vaults Page (Native)', () => {
  16 |   test.beforeEach(async ({ page }) => {
  17 |     await unlockApp(page);
  18 |   });
  19 | 
  20 |   test('shows the vaults page', async ({ page }) => {
  21 |     await page.click('.stash__nav-item:has-text("Vaults")');
  22 |     // Should show either projects or empty state
  23 |     const vaultsPage = page.locator('.vaults-page');
  24 |     await expect(vaultsPage).toBeVisible({ timeout: 5000 });
  25 |   });
  26 | 
  27 |   test('shows scan or new buttons', async ({ page }) => {
  28 |     const scanBtn = page.locator('button:has-text("Scan")');
  29 |     const newBtn = page.locator('button:has-text("New")');
  30 |     // At least one action button should be visible
  31 |     const hasScan = await scanBtn.isVisible().catch(() => false);
  32 |     const hasNew = await newBtn.isVisible().catch(() => false);
  33 |     expect(hasScan || hasNew).toBe(true);
  34 |   });
  35 | 
  36 |   test('can trigger filesystem scan', async ({ page }) => {
  37 |     const scanBtn = page.locator('button:has-text("Scan")');
  38 |     if (await scanBtn.isVisible().catch(() => false)) {
  39 |       await scanBtn.click();
  40 |       // Scan should start — look for scanning indicator or results
  41 |       // The real backend will actually scan the filesystem
  42 |       await page.waitForTimeout(2000);
  43 |     }
  44 |   });
  45 | });
  46 | 
```