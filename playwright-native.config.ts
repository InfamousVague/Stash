import { defineConfig } from '@playwright/test';

/**
 * Native Tauri E2E tests using Playwright.
 *
 * This launches the Vite dev server AND the Tauri binary together.
 * Playwright tests against Chromium, but the Tauri app also launches
 * so you can visually verify the native window behavior alongside.
 *
 * The tests interact with the real Tauri Rust backend (no mocks)
 * via the dev server that both the WebView and Playwright share.
 *
 * Usage:
 *   npm run test:native          — headless
 *   npm run test:native:headed   — visible browser + native app
 */
export default defineConfig({
  testDir: './e2e-native',
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:1420',
    trace: 'on-first-retry',
    // Slow down for visibility when running headed
    launchOptions: {
      slowMo: process.env.SLOW ? 500 : 0,
    },
  },
  webServer: {
    // Launch Tauri dev mode — starts both Vite + the native window
    command: 'npx tauri dev',
    port: 1420,
    reuseExistingServer: true,
    timeout: 60000, // Tauri dev takes longer to start
  },
  // Run one at a time so we don't conflict with the single Tauri instance
  workers: 1,
});
