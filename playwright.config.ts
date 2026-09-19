import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}` },
  // Mobile Safari is emulated with WebKit; real-device checks still matter for iOS quirks.
  projects: [
    { name: 'iphone-se', use: { ...devices['iPhone SE'] } }, // 320px, WebKit
    { name: 'iphone-13', use: { ...devices['iPhone 13'] } }, // 390px, WebKit
    { name: 'pixel-7', use: { ...devices['Pixel 7'] } }, // 412px, Chromium
    { name: 'ipad-mini', use: { ...devices['iPad Mini'] } }, // 768px, WebKit
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    // Firefox has no mobile emulation in Playwright, so it runs as a desktop browser at a
    // phone-sized and a desktop viewport.
    { name: 'firefox-narrow', use: { ...devices['Desktop Firefox'], viewport: { width: 390, height: 844 } } },
    { name: 'firefox-desktop', use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: `next dev -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
