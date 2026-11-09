const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:4182', browserName: process.env.SCA_TEST_BROWSER === 'webkit' ? 'webkit' : 'chromium', viewport: { width: 1440, height: 1000 } },
  webServer: { command: 'python3 -m http.server 4182 --bind 127.0.0.1', url: 'http://127.0.0.1:4182', reuseExistingServer: process.env.SCA_TEST_REUSE_SERVER === '1' },
  reporter: 'list',
});
