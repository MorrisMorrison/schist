import { authService } from '#lib/auth/auth-service.ts';
import { redirect } from '@sveltejs/kit';
import type { LayoutLoad } from './$types';

export const ssr = false;
export const csr = true;

export const load: LayoutLoad = async ({ url }) => {
	await authService.initialize();

	// Skip authentication for public routes
	if (
		url.pathname === '/login' ||
		url.pathname === '/setup' ||
		url.pathname.startsWith('/share/')
	) {
		return {};
	}

	// requireAuth() no-ops (returns true) when auth is disabled, so no isAuthEnabled() guard is needed.
	const isAuthenticated = await authService.requireAuth(url.pathname);
	if (!isAuthenticated) {
		throw redirect(303, `/login?returnUrl=${encodeURIComponent(url.pathname)}`);
	}

	// Layout only handles auth - components handle their own data loading
	return {};
};
