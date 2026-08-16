import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Loads STRIPE_SECRET_KEY etc from ../.env.local for the (skipped-unless-configured)
    // integration tests, same dotenv-loading pattern as the root vitest.setup.ts.
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../src'),
    },
  },
});
