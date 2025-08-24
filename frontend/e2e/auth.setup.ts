import { test as setup } from '@playwright/test';
import { ApiHelper } from './utils/api-helpers';
import { AUTH_ENABLED_BASE_URL } from './utils/routes';
import * as fs from 'fs';
import * as path from 'path';

const authFile = 'playwright/.auth/user.json';

setup('authenticate', async ({ page, request }) => {
	const baseURL = `${AUTH_ENABLED_BASE_URL}/api`;
	const apiHelper = new ApiHelper(request, 0, baseURL);
	
	console.log(`[Auth Setup] Setting up authentication for CI environment`);

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

		// For CI, we'll create a minimal authenticated state by navigating to the app
		// and injecting authentication tokens directly rather than going through WebAuthn
		console.log('[Auth Setup] Creating minimal authenticated state for CI...');
		
		// Navigate to the auth-enabled server
		await page.goto(AUTH_ENABLED_BASE_URL);
		
		// Check if setup is required
		const setupResponse = await apiHelper.checkSetupRequired();
		const requiresSetup = (setupResponse.data as { requires_setup: boolean }).requires_setup;
		
		if (requiresSetup) {
			console.log('[Auth Setup] First-time setup required, but WebAuthn not available in CI');
			console.log('[Auth Setup] Creating mock authentication state...');
			
			// Since WebAuthn doesn't work in CI, we'll create a minimal auth state
			// by setting localStorage/sessionStorage values that the app expects
			await page.evaluate(() => {
				// Set up minimal authentication state
				localStorage.setItem('schist-auth', 'true');
				sessionStorage.setItem('schist-user', JSON.stringify({
					id: 'e2e-test-user',
					username: 'testuser',
					isAuthenticated: true
				}));
			});
		}

		// For now, just create a minimal storage state that indicates authentication
		const storageState = {
			cookies: [],
			origins: [
				{
					origin: AUTH_ENABLED_BASE_URL,
					localStorage: [
						{
							name: 'schist-auth',
							value: 'true'
						}
					]
				}
			]
		};

		// Save the mock authentication state
		const authDir = path.dirname(authFile);
		
		// Ensure directory exists
		if (!fs.existsSync(authDir)) {
			fs.mkdirSync(authDir, { recursive: true });
		}
		
		fs.writeFileSync(authFile, JSON.stringify(storageState, null, 2));
		console.log(`[Auth Setup] Mock authentication state saved to ${authFile}`);
		
		console.log('[Auth Setup] Setup completed successfully for CI environment');
	} catch (error) {
		console.error('[Auth Setup] Authentication setup failed:', error);
		throw error;
	}
});
