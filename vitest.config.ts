import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
    // db.test.ts requires better-sqlite3, which is compiled against Electron's Node ABI.
    // Run it separately after `npm rebuild better-sqlite3` against the system Node version.
    exclude: ['tests/db.test.ts'],
  },
  resolve: {
    alias: {
      electron: '/home/suop/repos/suopWatcher/tests/__mocks__/electron.ts',
    },
  },
})
