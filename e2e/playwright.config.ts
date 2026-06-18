import { defineConfig, devices } from '@playwright/test';

/**
 * @see https://playwright.dev/docs/test-configuration
 */
// Detect if we're running in CI
const isCI = !!globalThis.process?.env.CI;

// Single E2E test URL
const baseURL = globalThis.process?.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';

export default defineConfig({
	testDir: './tests',

	fullyParallel: true,

	/* Fail the build on CI if you accidentally left test.only in the source code. */
	forbidOnly: isCI,

	retries: isCI ? 2 : 0,

	/* Run with a single worker: the suite shares one backend instance and a single
	   auth/storage state, and several suites use test.describe.serial, so parallel
	   workers would cause cross-test data interference. */
	workers: 1,

	/* Global timeout for each test. 60s for self-hosted hardware: the VPS runner
	   is slower than GitHub-hosted, and the WebAuthn ceremony in auth.setup can
	   take ~45s under load. */
	timeout: 60 * 1000,

	/* Expect timeout for assertions */
	expect: {
		timeout: 5 * 1000
	},

	/* Global teardown script to clean up auth files */
	globalTeardown: './global-teardown.ts',

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
		viewport: { width: 1280, height: 720 },
		// The CI container runs as root, where Chromium refuses to launch without
		// --no-sandbox.
		...(isCI ? { launchOptions: { args: ['--no-sandbox'] } } : {})
	},

	projects: [
		{
			name: 'setup',
			testDir: '.',
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
	// In CI, the services are started by GitHub Actions using docker compose
	...(isCI
		? {}
		: {
				webServer: {
					command: 'docker compose --profile e2e up --build',
					port: 3000,
					reuseExistingServer: true,
					timeout: 180 * 1000 // 3 minutes for local Docker builds
				}
			})
});
