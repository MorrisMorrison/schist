import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

// The Recent page became the Recent list on Home.
export const load: PageLoad = () => {
	redirect(307, '/');
};
