# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: unlock.spec.ts >> Unlock Screen (Native) >> can create vault and unlock
- Location: e2e-native/unlock.spec.ts:12:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('.stash__sidebar')
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for locator('.stash__sidebar')

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
  3  | test.describe('Unlock Screen (Native)', () => {
  4  |   test('shows unlock screen on launch', async ({ page }) => {
  5  |     await page.goto('/');
  6  |     const unlockScreen = page.locator('.unlock-screen');
  7  |     await expect(unlockScreen).toBeVisible({ timeout: 10000 });
  8  |     await expect(page.locator('input[type="password"]')).toBeVisible();
  9  |     await expect(page.locator('button[type="submit"]')).toBeVisible();
  10 |   });
  11 | 
  12 |   test('can create vault and unlock', async ({ page }) => {
  13 |     await page.goto('/');
  14 |     await page.waitForSelector('.unlock-screen', { timeout: 10000 });
  15 | 
  16 |     await page.fill('input[type="password"]', 'test-password-123');
  17 | 
  18 |     // If first run, fill confirm password
  19 |     const confirmInput = page.locator('input[placeholder*="Confirm"]');
  20 |     if (await confirmInput.isVisible().catch(() => false)) {
  21 |       await confirmInput.fill('test-password-123');
  22 |     }
  23 | 
  24 |     await page.click('button[type="submit"]');
  25 | 
  26 |     // Should see the main app sidebar (real Tauri backend)
> 27 |     await expect(page.locator('.stash__sidebar')).toBeVisible({ timeout: 10000 });
     |                                                   ^ Error: expect(locator).toBeVisible() failed
  28 |   });
  29 | });
  30 | 
```