import type { PageLoad } from './$types';

export const load: PageLoad = async () => {
	// Future: Add any OAuth provider configuration or redirects
	return {
		title: 'Login - Schist Wiki'
	};
};
