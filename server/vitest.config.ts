import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@defs': path.resolve(__dirname, 'src/defs/index.ts'),
      '@sdk/server-types': path.resolve(__dirname, 'src/__generated__/server-types.d.ts'),
    },
  },
  test: {
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/**/*.test.ts'],
    // Don't try to resolve edgespark to the d.ts file — we mock it in setup
  },
});
