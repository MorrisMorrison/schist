import { defineConfig, devices } from '@playwright/test';

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
	testDir: './e2e',

	/* Run tests in files in parallel */
	fullyParallel: true,

	/* Fail the build on CI if you accidentally left test.only in the source code. */
	forbidOnly: !!process.env.CI,

	/* Retry on CI only */
	retries: process.env.CI ? 2 : 0,

	/* Disable parallelism completely to fix race conditions */
	workers: 1,

	/* Global timeout for each test */
	timeout: 30 * 1000,

	/* Expect timeout for assertions */
	expect: {
		timeout: 5 * 1000
	},

	/* Reporter to use. See https://playwright.dev/docs/test-reporters */
	reporter: [
		['html', { outputFolder: 'playwright-report' }],
		['json', { outputFile: 'playwright-report/results.json' }],
		['list'] // Console output during test runs
	],

	/* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
	use: {
		/* Base URL will be set dynamically per worker via fixture */
		baseURL: 'http://localhost:4173', // Default fallback

		/* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
		trace: 'on-first-retry',

		/* Take screenshot on failure */
		screenshot: 'only-on-failure',

		/* Record video on failure */
		video: 'retain-on-failure'
	},

	/* Configure projects for major browsers */
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] }
		}

		// {
		// 	name: 'firefox',
		// 	use: { ...devices['Desktop Firefox'] }
		// },

		// {
		// 	name: 'webkit',
		// 	use: { ...devices['Desktop Safari'] }
		// },

		/* Test against mobile viewports. */
		// {
		// 	name: 'Mobile Chrome',
		// 	use: { ...devices['Pixel 5'] }
		// }
		// {
		// 	name: 'Mobile Safari',
		// 	use: { ...devices['iPhone 12'] }
		// }

		/* Test against branded browsers. */
		// {
		//   name: 'Microsoft Edge',
		//   use: { ...devices['Desktop Edge'], channel: 'msedge' },
		// },
		// {
		//   name: 'Google Chrome',
		//   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
		// },
	],

	/* Run your local dev server before starting the tests */
	webServer: [
		// Backend servers - one per worker for isolation
		{
			command:
				'cd ../backend/cmd/schist && ENV=development SCHIST_PORT=8081 SCHIST_FRONTEND_URL=http://localhost:4173 SCHIST_DATA_DIR=test-data-worker-1 go run main.go',
			port: 8081,
			reuseExistingServer: false, // Don't reuse - each worker needs its own
			timeout: 60 * 1000
		},
		{
			command:
				'cd ../backend/cmd/schist && ENV=development SCHIST_PORT=8082 SCHIST_FRONTEND_URL=http://localhost:4174 SCHIST_DATA_DIR=test-data-worker-2 go run main.go',
			port: 8082,
			reuseExistingServer: false,
			timeout: 60 * 1000
		},
		{
			command:
				'cd ../backend/cmd/schist && ENV=development SCHIST_PORT=8083 SCHIST_FRONTEND_URL=http://localhost:4175 SCHIST_DATA_DIR=test-data-worker-3 go run main.go',
			port: 8083,
			reuseExistingServer: false,
			timeout: 60 * 1000
		},
		{
			command:
				'cd ../backend/cmd/schist && ENV=development SCHIST_PORT=8084 SCHIST_FRONTEND_URL=http://localhost:4176 SCHIST_DATA_DIR=test-data-worker-4 go run main.go',
			port: 8084,
			reuseExistingServer: false,
			timeout: 60 * 1000
		},
		// Frontend servers - each connecting to its worker-specific backend
		{
			command:
				'npm run build && PUBLIC_API_URL=http://localhost:8081/api npm run preview -- --port 4173',
			port: 4173,
			reuseExistingServer: false,
			timeout: 120 * 1000
		},
		{
			command: 'PUBLIC_API_URL=http://localhost:8082/api npm run preview -- --port 4174',
			port: 4174,
			reuseExistingServer: false,
			timeout: 120 * 1000
		},
		{
			command: 'PUBLIC_API_URL=http://localhost:8083/api npm run preview -- --port 4175',
			port: 4175,
			reuseExistingServer: false,
			timeout: 120 * 1000
		},
		{
			command: 'PUBLIC_API_URL=http://localhost:8084/api npm run preview -- --port 4176',
			port: 4176,
			reuseExistingServer: false,
			timeout: 120 * 1000
		}
	]
});
