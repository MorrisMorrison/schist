import { defineConfig, devices } from '@playwright/test';

/**
 * @see https://playwright.dev/docs/test-configuration
 */
// Detect if we're running in CI
const isCI = !!globalThis.process?.env.CI;

// Get CI container URLs from environment or use defaults
const authDisabledURL = isCI 
  ? (globalThis.process?.env.E2E_AUTH_DISABLED_URL || 'http://localhost:8081')
  : 'http://localhost:8081';
const authEnabledURL = isCI 
  ? (globalThis.process?.env.E2E_AUTH_ENABLED_URL || 'http://localhost:8082') 
  : 'http://localhost:8082';

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
		baseURL: isCI ? undefined : 'http://localhost:8081',
		trace: 'on-first-retry',
		screenshot: 'only-on-failure',
		video: 'retain-on-failure',
		viewport: { width: 1280, height: 720 },
		// Enable WebAuthn support for passkey testing
		launchOptions: {
			args: [
				'--enable-web-authentication-api',
				'--enable-webauthn-ctap2',
				'--no-sandbox'
			]
		}
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

	// Only use webServer for local development, not in CI
	// In CI, the services are started by GitHub Actions using docker-compose.e2e-ci.yml
	...(isCI ? {} : {
		webServer: {
			command: 'cd .. && ./scripts/start-e2e-servers.sh',
			port: 8081,
			reuseExistingServer: true,
			timeout: 180 * 1000 // 3 minutes for local Docker builds
		}
	})
});
