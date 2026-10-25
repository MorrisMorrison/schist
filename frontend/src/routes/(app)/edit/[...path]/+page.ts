import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

// Editing happens in place on the document page; /edit/<path> stays as a deep
// link (bookmarks, old links) that opens it in edit mode.
export const load: PageLoad = ({ params }) => {
	redirect(307, `/documents/${params.path}?mode=edit`);
};
