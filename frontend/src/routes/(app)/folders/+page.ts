import type { PageLoad } from './$types';
import { authService } from '$lib/auth/auth-service';
import { redirect } from '@sveltejs/kit';

export const load: PageLoad = async ({ url }) => {
	await authService.initialize();

	if (authService.isAuthEnabled()) {
		const isAuthenticated = await authService.requireAuth(url.pathname);
		if (!isAuthenticated) {
			throw redirect(303, `/login?returnUrl=${encodeURIComponent(url.pathname)}`);
		}
	}

	return {};
};
