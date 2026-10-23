import { defineConfig } from '@playwright/test';

export default defineConfig({ testDir: './tests/native', outputDir: 'test-results/native', workers: 1, timeout: 45000 });
