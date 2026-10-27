import { defineEnvVars } from '@sveltejs/kit/env';

// Environment variables, exposed through $app/env/public (SvelteKit 3's
// replacement for $env/dynamic/public).
export const variables = defineEnvVars({
	PUBLIC_API_URL: {
		public: true,
		description: 'Base URL of the Schist API. When unset, the app calls the relative path /api.',
		schema: (value) => value || undefined
	}
});
