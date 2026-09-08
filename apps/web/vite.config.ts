import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@diamond-erp/contracts': path.resolve(__dirname, '../../packages/contracts/src/index.ts'),
      '@diamond-erp/shared-utils': path.resolve(__dirname, '../../packages/shared-utils/src/index.ts'),
    },
  },
  server: {
    port: 5175,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3002',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:3002',
        changeOrigin: true,
      },
    },
  },
});
