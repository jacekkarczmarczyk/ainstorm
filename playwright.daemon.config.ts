import { defineConfig, devices } from '@playwright/test';

// The built UI served by a real daemon (pnpm build first). Data lives in .daemon-test/, never in ~/.ainstorm.
export const DAEMON_PORT = 4478;
export const DAEMON_HOME = '.daemon-test';

export default defineConfig({
  testDir: 'e2e-daemon',
  reporter: [['list']],
  use: { baseURL: `http://127.0.0.1:${DAEMON_PORT}`, trace: 'retain-on-failure', permissions: ['clipboard-read', 'clipboard-write'] },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 900 } } }],
  webServer: {
    command: `node packages/server/src/main.ts --port ${DAEMON_PORT} --home ${DAEMON_HOME} --import packages/web/src/fixtures/map.json`,
    url: `http://127.0.0.1:${DAEMON_PORT}/health`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
