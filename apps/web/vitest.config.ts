import { defineConfig, configDefaults } from 'vitest/config';
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
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/tests/unit/**/*.{test,spec}.{ts,tsx}', 'src/**/__tests__/**/*.{test,spec}.{ts,tsx}'],
    exclude: [...configDefaults.exclude, '**/src/tests/e2e/**', '**/node_modules/**', '**/dist/**'],
    setupFiles: ['./src/tests/setup.ts'],
  },
});
