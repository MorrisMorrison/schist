import { test as setup, expect } from '@playwright/test';
import { ApiHelper } from './utils/api-helpers';

const authFile = 'playwright/.auth/user.json';

setup('authenticate', async ({ page, request }) => {
	const apiHelper = new ApiHelper(request, 0, 'http://localhost:8082/api');

	try {
		const loginResponse = await apiHelper.login('testuser', 'testpass123');
		console.log(`[Auth Setup] Login response status: ${loginResponse.status}`);
		console.log(`[Auth Setup] Login token present: ${loginResponse.data?.token ? 'yes' : 'no'}`);

		if (
			loginResponse.status === 200 &&
			loginResponse.data &&
			typeof loginResponse.data === 'object' &&
			'token' in loginResponse.data
		) {
			await page.goto('http://localhost:4174');

			const token = (loginResponse.data as { token: string }).token;
			await page.evaluate((token) => {
				localStorage.setItem('schist_auth_token', token);
			}, token);
			console.log(`[Auth Setup] Token saved to localStorage`);

			await page.reload();

			await expect(page).toHaveURL('http://localhost:4174/');
			await expect(page.getByTestId('nav-home')).toBeVisible();

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
