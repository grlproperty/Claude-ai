import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    testTimeout: 30_000,
    // Everything under tests/ runs against one real database, and several of
    // those files clear shared tables between cases. Run in parallel they
    // delete each other's rows and fail at random, which is worse than a slow
    // suite: a test that fails one run in five stops being read.
    //
    // The domain tests under src/ are pure and would be safe to parallelise,
    // but splitting the run in two to save a couple of seconds is not worth
    // the configuration.
    fileParallelism: false,
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
