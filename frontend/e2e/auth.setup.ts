import { test as setup, expect } from '@playwright/test';
import { ApiHelper } from './utils/api-helpers';

const authFile = 'playwright/.auth/user.json';

setup('authenticate', async ({ page, request }) => {
	const apiHelper = new ApiHelper(request, 0, 'http://localhost:8082/api');

	try {
		// Wait for the auth-enabled server to be ready
		console.log('[Auth Setup] Waiting for auth server to be ready...');
		const isReady = await apiHelper.waitForApiReady(30000);
		if (!isReady) {
			throw new Error('Auth server not ready after 30 seconds');
		}
		console.log('[Auth Setup] Auth server is ready');

		// Check server config to ensure auth is enabled
		const config = await apiHelper.getConfig();
		console.log(`[Auth Setup] Server auth_enabled: ${config.auth_enabled}`);
		if (!config.auth_enabled) {
			throw new Error('Server does not have authentication enabled');
		}

		const loginResponse = await apiHelper.login('testuser', 'testpass123');
		console.log(`[Auth Setup] Login response status: ${loginResponse.status}`);

		if (loginResponse.error) {
			console.error(`[Auth Setup] Login error: ${loginResponse.error}`);
		}
		if (loginResponse.data) {
			console.log(`[Auth Setup] Login response data:`, JSON.stringify(loginResponse.data, null, 2));
		}

		if (
			loginResponse.status === 200 &&
			loginResponse.data &&
			typeof loginResponse.data === 'object' &&
			'token' in loginResponse.data
		) {
			console.log(`[Auth Setup] Login token present: ${loginResponse.data.token ? 'yes' : 'no'}`);

			const token = (loginResponse.data as { token: string }).token;
			apiHelper.setAuthToken(token);

			await page.goto('http://localhost:4174/');
			await page.evaluate((token) => {
				localStorage.setItem('schist_auth_token', token);
			}, token);

			console.log(`[Auth Setup] Token saved to localStorage`);

			await page.goto('http://localhost:4174/');
			await expect(page).toHaveURL('http://localhost:4174/');
			await expect(page.getByTestId('nav-home').first()).toBeVisible();

			await page.context().storageState({ path: authFile });
			console.log(`[Auth Setup] Authentication state saved to ${authFile}`);
		} else {
			console.error(`[Auth Setup] Login failed with status ${loginResponse.status}`);
			throw new Error(`Login failed: ${loginResponse.status}`);
		}
	} catch (error) {
		console.error('[Auth Setup] Authentication setup failed:', error);
		throw error;
	}
});
