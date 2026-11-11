const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './tests/browser',
    workers: 1,
    reporter: 'list',
    outputDir: '.wrangler/test-results',
    use: {
        baseURL: 'http://127.0.0.1:8790',
        channel: process.env.TEST_BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : 'chromium'),
        headless: true,
        trace: 'retain-on-failure'
    },
    webServer: {
        command: 'node tests/server.mjs',
        url: 'http://127.0.0.1:8790/public/all-data',
        timeout: 90000,
        reuseExistingServer: false
    }
});
