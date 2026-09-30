import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: 'test/e2e',
    testMatch: '**/*.e2e-spec.ts',
    timeout: 30000,
    workers: 1,
    reporter: 'list'
});
