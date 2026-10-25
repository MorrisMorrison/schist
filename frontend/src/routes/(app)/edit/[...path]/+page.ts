import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

// PROTOTYPE (#246): /edit/<path> stays as a deep link (bookmarks, e2e) and opens the
// document page in edit mode.
export const load: PageLoad = ({ params }) => {
	redirect(307, `/documents/${params.path}?mode=edit`);
};
