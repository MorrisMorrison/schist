import { defineConfig, devices } from '@playwright/test';

/**
 * @see https://playwright.dev/docs/test-configuration
 */
// Detect if we're running in CI
const isCI = !!globalThis.process?.env.CI;

// Single E2E test URL 
const baseURL = globalThis.process?.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';

// Debug: Log the URL being used
console.log('🔧 Playwright Config - URL:', {
	baseURL,
	CI: isCI,
	envVars: {
		PLAYWRIGHT_BASE_URL: globalThis.process?.env.PLAYWRIGHT_BASE_URL
	}
});

export default defineConfig({
	testDir: './e2e',

	fullyParallel: true,

	/* Fail the build on CI if you accidentally left test.only in the source code. */
	forbidOnly: isCI,

	retries: isCI ? 2 : 0,

	workers: isCI ? 1 : 1,

	/* Global timeout for each test */
	timeout: 20 * 1000,

	/* Expect timeout for assertions */
	expect: {
		timeout: 5 * 1000
	},

	/* Global teardown script to clean up auth files */
	globalTeardown: './e2e/global-teardown.ts',

	/* Reporter to use. See https://playwright.dev/docs/test-reporters */
	reporter: [
		['html', { outputFolder: 'playwright-report' }],
		['json', { outputFile: 'playwright-report/results.json' }],
		['list'] // Console output during test runs
	],

	/* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
	use: {
		baseURL: baseURL,
		trace: 'on-first-retry',
		screenshot: 'only-on-failure',
		video: 'retain-on-failure',
		viewport: { width: 1280, height: 720 }
	},

	projects: [
		{
			name: 'setup',
			testMatch: /.*\.setup\.ts/,
			use: {
				...devices['Desktop Chrome']
			}
		},
		{
			name: 'e2e',
			use: {
				...devices['Desktop Chrome'],
				storageState: 'playwright/.auth/user.json'
			},
			dependencies: ['setup'],
			testIgnore: [/.*\.setup\.ts/]
		}
	],

	// Only use webServer for local development, not in CI
	// In CI, the services are started by GitHub Actions using docker-compose.e2e.yml
	...(isCI
		? {}
		: {
				webServer: {
					command: 'cd .. && docker-compose -f docker-compose.e2e.yml up --build',
					port: 3000,
					reuseExistingServer: true,
					timeout: 180 * 1000 // 3 minutes for local Docker builds
				}
			})
});
