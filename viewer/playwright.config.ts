import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

const projectRoot = typeof __dirname !== 'undefined'
  ? path.resolve(__dirname, '..')
  : process.cwd();

export default defineConfig({
  testDir: path.resolve(projectRoot, 'tests', 'viewer'),
  testMatch: /.*\.spec\.(ts|js|mjs)/,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry'
  },
  webServer: {
    command: 'npm run viewer:preview',
    cwd: projectRoot,
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 15_000
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
});
