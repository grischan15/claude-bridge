import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    // Vitest v2 exits non-zero when no test files exist; needed during scaffold phase
    passWithNoTests: true,
  },
})
