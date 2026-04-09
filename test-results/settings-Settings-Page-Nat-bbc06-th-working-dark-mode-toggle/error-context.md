# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: settings.spec.ts >> Settings Page (Native) >> shows appearance section with working dark mode toggle
- Location: e2e-native/settings.spec.ts:21:3

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
  3  | async function unlockAndNavigate(page: import('@playwright/test').Page) {
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
  13 |   await page.click('.stash__nav-item:has-text("Settings")');
  14 | }
  15 | 
  16 | test.describe('Settings Page (Native)', () => {
  17 |   test.beforeEach(async ({ page }) => {
  18 |     await unlockAndNavigate(page);
  19 |   });
  20 | 
  21 |   test('shows appearance section with working dark mode toggle', async ({ page }) => {
  22 |     await expect(page.locator('text=Dark Mode')).toBeVisible();
  23 |     const html = page.locator('html');
  24 |     const initialTheme = await html.getAttribute('data-theme');
  25 |     await page.locator('.toggle').first().click();
  26 |     const newTheme = await html.getAttribute('data-theme');
  27 |     expect(newTheme).not.toBe(initialTheme);
  28 |   });
  29 | 
  30 |   test('shows security section with real vault status', async ({ page }) => {
  31 |     await expect(page.locator('text=Vault Status')).toBeVisible();
  32 |     // Should be unlocked since we just unlocked
  33 |     await expect(page.locator('text=Unlocked')).toBeVisible();
  34 |     await expect(page.locator('button:has-text("Lock Now")')).toBeVisible();
  35 |   });
  36 | 
  37 |   test('shows CLI section with preview', async ({ page }) => {
  38 |     await expect(page.getByRole('heading', { name: 'CLI' })).toBeVisible();
  39 |     const cliPreview = page.locator('.settings-page__cli-preview');
  40 |     await expect(cliPreview).toBeVisible();
  41 |     await expect(cliPreview).toContainText('stash pull');
  42 |   });
  43 | 
  44 |   test('shows about section', async ({ page }) => {
  45 |     await expect(page.locator('text=AES-256-GCM')).toBeVisible();
  46 |   });
  47 | });
  48 | 
```