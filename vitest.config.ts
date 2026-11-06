import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: { name: 'core', include: ['packages/core/test/**/*.test.ts'], environment: 'node' },
      },
      {
        test: { name: 'server', include: ['packages/server/test/**/*.test.ts'], environment: 'node' },
      },
      {
        test: { name: 'plugin', include: ['plugin/test/**/*.test.ts'], environment: 'node' },
      },
      {
        extends: './packages/web/vite.config.ts',
        test: { name: 'web', include: ['packages/web/src/**/*.test.ts'], environment: 'jsdom' },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['packages/core/src/**', 'packages/web/src/**'],
      thresholds: { 'packages/core/src/**': { lines: 90 } },
    },
  },
});
