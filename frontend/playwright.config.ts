import { defineConfig, devices } from '@playwright/test'
import * as dotenv from 'dotenv'

// Load test environment variables
dotenv.config({ path: '.env.test' })

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: '../tests/frontend/e2e',
  
  /* Global setup and teardown */
  globalSetup: require.resolve('../tests/frontend/e2e/setup/global-setup'),
  globalTeardown: require.resolve('../tests/frontend/e2e/setup/global-teardown'),
  
  /* Run tests in files in parallel */
  fullyParallel: false, // Run sequentially for E2E tests to avoid conflicts
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : 1, // Always use 1 worker for E2E tests
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list'],
    ['json', { outputFile: 'test-results/results.json' }]
  ],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:13000',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    
    /* Screenshot on failure */
    screenshot: 'only-on-failure',
    
    /* Video on failure */
    video: 'retain-on-failure',
    
    /* Timeout for each action */
    actionTimeout: 10000,
    
    /* Navigation timeout */
    navigationTimeout: 30000,

    /**
     * 复用全局登录态（由 global-setup 生成）。
     * 路径放在 test-results 下，避免污染仓库与便于本地清理。
     */
    storageState: process.env.PLAYWRIGHT_STORAGE_STATE || 'test-results/.auth/storageState.json',
  },
  
  /* Global timeout for each test */
  timeout: 60000,
  
  /* Expect timeout */
  expect: {
    timeout: 10000,
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    // Uncomment to test on other browsers
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },

    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:13000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
})
