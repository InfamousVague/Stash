# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: navigation.spec.ts >> Navigation (Native) >> can navigate to each page
- Location: e2e-native/navigation.spec.ts:29:3

# Error details

```
TimeoutError: page.waitForSelector: Timeout 10000ms exceeded.
Call log:
  - waiting for locator('.stash__sidebar') to be visible

```

# Page snapshot

```yaml
- generic [ref=e4]:
  - img "Stash" [ref=e5]
  - heading "Create Vault" [level=1] [ref=e6]
  - paragraph [ref=e7]: Set a master password to encrypt your vault.
  - generic [ref=e8]:
    - textbox "Master password" [ref=e10]: test-password-123
    - textbox "Confirm password" [ref=e12]: test-password-123
  - paragraph [ref=e13]: "TypeError: Cannot read properties of undefined (reading 'invoke')"
  - button "Create Vault" [active] [ref=e15] [cursor=pointer]
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
     |              ^ TimeoutError: page.waitForSelector: Timeout 10000ms exceeded.
  13 | }
  14 | 
  15 | test.describe('Navigation (Native)', () => {
  16 |   test.beforeEach(async ({ page }) => {
  17 |     await unlockApp(page);
  18 |   });
  19 | 
  20 |   test('shows sidebar with all nav items', async ({ page }) => {
  21 |     // 8 nav items + Help + Lock = 10
  22 |     await expect(page.locator('.stash__nav-item')).toHaveCount(10);
  23 |   });
  24 | 
  25 |   test('defaults to Vaults page', async ({ page }) => {
  26 |     await expect(page.locator('.stash__nav-item--active')).toHaveText('Vaults');
  27 |   });
  28 | 
  29 |   test('can navigate to each page', async ({ page }) => {
  30 |     const pages = ['Discover', 'API Directory', 'Saved Keys', 'Key Health', 'Teams', 'Contacts', 'Settings'];
  31 |     for (const label of pages) {
  32 |       await page.click(`.stash__nav-item:has-text("${label}")`);
  33 |       await expect(page.locator('.stash__nav-item--active')).toHaveText(label);
  34 |     }
  35 |   });
  36 | 
  37 |   test('can lock and return to unlock screen', async ({ page }) => {
  38 |     await page.click('.stash__sidebar-footer .stash__nav-item:has-text("Lock")');
  39 |     await expect(page.locator('.unlock-screen')).toBeVisible({ timeout: 5000 });
  40 |   });
  41 | });
  42 | 
```