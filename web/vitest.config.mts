import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // `server-only` throws outside a React Server environment; stub it for unit tests.
    alias: { 'server-only': fileURLToPath(new URL('./src/lib/engines/__tests__/server-only-stub.ts', import.meta.url)) },
  },
});
