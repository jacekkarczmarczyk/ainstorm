import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

// Loopback only: the UI must never be reachable from the network
const HOST = '127.0.0.1';

export default defineConfig({
  root: import.meta.dirname,
  plugins: [vue()],
  server: { host: HOST, port: 5174, strictPort: true },
  preview: { host: HOST, port: 5175, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true },
});
