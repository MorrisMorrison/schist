import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params }) => {
	const { path } = params;
	return { path };
};
