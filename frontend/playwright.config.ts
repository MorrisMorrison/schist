import { defineConfig, devices } from '@playwright/test';

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
	testDir: './e2e',

	fullyParallel: true,

	/* Fail the build on CI if you accidentally left test.only in the source code. */
	forbidOnly: !!globalThis.process?.env.CI,

	retries: globalThis.process?.env.CI ? 2 : 0,

	workers: globalThis.process?.env.CI ? 1 : 1,

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
				baseURL: 'http://localhost:8081'
			},
			testIgnore: [/.*authentication\.test\.ts/, /.*quick-unlock\.test\.ts/]
		},
		{
			name: 'auth-enabled-unauthenticated',
			use: {
				...devices['Desktop Chrome'],
				baseURL: 'http://localhost:8082'
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
				baseURL: 'http://localhost:8082',
				storageState: 'playwright/.auth/user.json'
			},
			dependencies: ['setup'],
			testMatch: [/.*authentication\.test\.ts/, /.*quick-unlock\.test\.ts/],
			grepInvert: /Unauthenticated State/
		}
	],

	webServer: [
		{
			command: 'cd .. && ./scripts/start-e2e-servers.sh',
			port: 8081,
			reuseExistingServer: true,
			timeout: 120 * 1000
		},
		{
			command: 'sleep 2',
			port: 8082,
			reuseExistingServer: true,
			timeout: 10 * 1000
		}
	]
});
