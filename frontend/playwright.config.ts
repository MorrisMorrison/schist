import { defineConfig, devices } from '@playwright/test';

/**
 * @see https://playwright.dev/docs/test-configuration
 */
// Detect if we're running in CI
const isCI = !!globalThis.process?.env.CI;

// Use consistent localhost URLs for both local and CI
const authDisabledURL = 'http://localhost:8081';
const authEnabledURL = 'http://localhost:8082';

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
		/* Base URL will be set dynamically per worker via fixture */
		baseURL: 'http://localhost:8081',
		trace: 'on-first-retry',
		screenshot: 'only-on-failure',
		video: 'retain-on-failure',
		viewport: { width: 1280, height: 720 }
	},

	projects: [
		{
			name: 'setup',
			testMatch: /.*\.setup\.ts/
		},
		{
			name: 'auth-disabled',
			use: {
				...devices['Desktop Chrome'],
				baseURL: authDisabledURL
			},
			testIgnore: [/.*authentication\.test\.ts/, /.*quick-unlock\.test\.ts/]
		},
		{
			name: 'auth-enabled-unauthenticated',
			use: {
				...devices['Desktop Chrome'],
				baseURL: authEnabledURL
				// No storageState - start fresh for unauthenticated tests
			},
			dependencies: ['setup'],
			testMatch: [/.*authentication\.test\.ts/],
			grep: /Unauthenticated State/
		},
		{
			name: 'auth-enabled',
			use: {
				...devices['Desktop Chrome'],
				baseURL: authEnabledURL,
				storageState: 'playwright/.auth/user.json'
			},
			dependencies: ['setup'],
			testMatch: [/.*authentication\.test\.ts/, /.*quick-unlock\.test\.ts/],
			grepInvert: /Unauthenticated State/
		}
	],

	webServer: {
		command: 'cd .. && docker-compose -f docker-compose.e2e-ci.yml up --build',
		port: 8081,
		reuseExistingServer: !isCI,
		timeout: 120 * 1000 // 2 minutes for Docker builds
	}
});
