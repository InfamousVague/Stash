import { type Page } from '@playwright/test';
import { getTauriMockScript } from './tauri-mock';

/**
 * Set up Tauri IPC mocks before page load.
 */
export async function setupMocks(page: Page) {
  await page.addInitScript(getTauriMockScript());
}

/**
 * Navigate through the unlock screen by entering a password.
 */
export async function unlockApp(page: Page) {
  await page.goto('/');
  // Wait for unlock screen
  await page.waitForSelector('.unlock-screen', { timeout: 5000 });
  // Type password and submit
  await page.fill('input[type="password"]', 'test-password');
  await page.click('button[type="submit"]');
  // Wait for main app to load
  await page.waitForSelector('.stash__sidebar', { timeout: 5000 });
}

/**
 * Click a sidebar nav item by label text.
 */
export async function navigateTo(page: Page, label: string) {
  await page.click(`.stash__nav-item:has-text("${label}")`);
}

/**
 * Full setup: mock + unlock + wait for app.
 * Also marks the tour as completed so it doesn't overlay the UI.
 */
export async function setupAndUnlock(page: Page) {
  await setupMocks(page);
  // Mark tour as completed before page load to prevent overlay interference
  await page.addInitScript(() => {
    localStorage.setItem('stash-tour-completed', 'true');
  });
  await unlockApp(page);
}
