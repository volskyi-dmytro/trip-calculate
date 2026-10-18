import { defineConfig } from '@playwright/test'

// Runs against a LOCAL stack only: Spring (dev profile, :8080) behind the Vite dev proxy (:3000).
// Start the backend first: `mvn spring-boot:run -Dspring-boot.run.profiles=dev`.
// Files are *.e2e.ts (not *.spec.ts) so vitest never picks them up.
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  workers: 1, // shared H2 database and Nominatim politeness: no parallel tabs
  retries: 0,
  reporter: [['list']],
  outputDir: './e2e/.results',
  use: { baseURL: 'http://localhost:3000', screenshot: 'only-on-failure', trace: 'off' },
  webServer: { command: 'npm run dev', url: 'http://localhost:3000', reuseExistingServer: true, timeout: 60_000 },
})
