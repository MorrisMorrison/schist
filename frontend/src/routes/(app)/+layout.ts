import { authService } from '$lib/auth/auth-service';
import { redirect } from '@sveltejs/kit';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ url }) => {
	await authService.initialize();

	const isAuthenticated = await authService.requireAuth(url.pathname + url.search);
	if (!isAuthenticated) {
		// requireAuth handles the redirect internally, but SvelteKit layout needs explicit redirect
		throw redirect(303, `/login?returnUrl=${encodeURIComponent(url.pathname + url.search)}`);
	}

	// Layout only handles auth - components handle their own data loading
	return {};
};
