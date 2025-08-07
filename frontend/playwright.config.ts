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
		baseURL: 'http://localhost:4173',
		trace: 'on-first-retry',
		screenshot: 'only-on-failure',
		video: 'retain-on-failure'
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
				baseURL: 'http://localhost:4173'
			},
			dependencies: ['setup'],
			testIgnore: /.*authentication\.test\.ts/
		},
		{
			name: 'auth-enabled',
			use: {
				...devices['Desktop Chrome'],
				baseURL: 'http://localhost:4174',
				storageState: 'playwright/.auth/user.json'
			},
			dependencies: ['setup'],
			testMatch: /.*authentication\.test\.ts/
		}
	],

	webServer: [
		{
			command:
				'cd ../backend/cmd/schist && ENV=development SCHIST_PORT=8081 SCHIST_FRONTEND_URL=http://localhost:4173 SCHIST_DATA_DIR=test-data-auth-disabled go run main.go',
			port: 8081,
			reuseExistingServer: true,
			timeout: 60 * 1000
		},
		{
			command:
				'cd ../backend/cmd/schist && ENV=development SCHIST_PORT=8082 SCHIST_FRONTEND_URL=http://localhost:4174 SCHIST_DATA_DIR=test-data-auth-enabled SCHIST_AUTH_ENABLED=true SCHIST_AUTH_USERS="testuser:$2a$10$4g1x0g52pZ1EtekJO8C2YuLrKWMVOi97lBpI0yOo/nXGs5iNywrHe" SCHIST_JWT_SECRET="test-jwt-secret-for-e2e-testing" go run main.go',
			port: 8082,
			reuseExistingServer: true,
			timeout: 60 * 1000
		},
		{
			command: 'PUBLIC_API_URL=http://localhost:8081/api npm run preview -- --port 4173',
			port: 4173,
			reuseExistingServer: false,
			timeout: 60 * 1000
		},
		{
			command: 'PUBLIC_API_URL=http://localhost:8082/api npm run preview -- --port 4174',
			port: 4174,
			reuseExistingServer: true,
			timeout: 60 * 1000
		}
	]
});
