// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  fullyParallel: false,
  retries: 0,
  reporter: [
    ['html', { outputFolder: 'reports/html', open: 'never' }],
    ['json', { outputFile: 'reports/results.json' }],
    ['list'],
  ],
  outputDir: 'reports/test-results',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    video: 'on',
    screenshot: 'on',
    trace: 'on',
  },
  projects: [
    { name: 'chromium-1366x768', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } } },
    { name: 'chromium-1920x1080', use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } } },
    { name: 'chromium-2560x1440', use: { ...devices['Desktop Chrome'], viewport: { width: 2560, height: 1440 } } },
    { name: 'chromium-mobile-375x667', use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 667 } } },
    { name: 'chromium-mobile-390x844', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } },
    { name: 'chromium-mobile-844x390-landscape', use: { ...devices['Desktop Chrome'], viewport: { width: 844, height: 390 } } },
    { name: 'chromium-tablet-768x1024', use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } } },
    { name: 'chromium-tablet-1024x768', use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 768 } } },
    { name: 'chromium-1440x900', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'firefox-1366x768', use: { ...devices['Desktop Firefox'], viewport: { width: 1366, height: 768 } } },
    { name: 'webkit-1366x768', use: { ...devices['Desktop Safari'], viewport: { width: 1366, height: 768 } } },
  ],
});
