import { defineConfig } from 'vitest/config';

/** Testes que exigem o Firestore Emulator (rode via `npm run test:emulators`). */
export default defineConfig({
  test: {
    include: ['src/**/*.emulator.spec.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
