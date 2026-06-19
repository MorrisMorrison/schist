import type { PageLoad } from './$types';

// Auth is handled by the (app) group layout (see (app)/+layout.ts).
// Page components handle their own data loading.
export const load: PageLoad = async () => {
	return {};
};
