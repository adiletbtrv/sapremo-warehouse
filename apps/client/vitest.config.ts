import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/setupTests.ts',
    pool: 'forks',
    fileParallelism: false,
    testTimeout: 15000,
    hookTimeout: 15000,
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/e2e/**',
      '**/.{idea,git,cache,output,temp}/**',
    ],
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
