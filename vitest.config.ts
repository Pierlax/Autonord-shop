import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['lib/**/__tests__/**/*.test.ts'],
  },
  resolve: {
    alias: {
      // Mirror the "@/*" path alias from tsconfig.json
      '@': path.resolve(__dirname, '.'),
    },
  },
});
