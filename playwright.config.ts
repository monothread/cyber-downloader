import { defineConfig } from '@playwright/test';

// The windows of the tests open on the primary monitor (see createWindow in src/main/index.ts).
process.env.PULLWAVE_E2E_PRIMARY_DISPLAY = '1';

export default defineConfig({
    testDir: 'test/e2e',
    testMatch: '**/*.e2e-spec.ts',
    timeout: 30000,
    workers: 1,
    reporter: 'list'
});
