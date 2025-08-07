import type { PageLoad } from './$types.js';
import { authService } from '$lib/auth/auth-service';
import { redirect } from '@sveltejs/kit';

export const load: PageLoad = async ({ url }) => {
	// Initialize auth service if not already done
	await authService.initialize();

	// If auth is enabled, check authentication
	if (authService.isAuthEnabled()) {
		const isAuthenticated = await authService.requireAuth(url.pathname);
		if (!isAuthenticated) {
			throw redirect(303, `/login?returnUrl=${encodeURIComponent(url.pathname)}`);
		}
	}

	// Page components will handle their own data loading
	return {};
};
