import { describe, it, expect } from 'vitest';
import { isRedirect } from '@sveltejs/kit';
import { load } from './+page';

describe('/edit/<path>', () => {
	it('opens the document page in edit mode', () => {
		let thrown: unknown;
		try {
			load({ params: { path: 'notes/plan' } } as never);
		} catch (err) {
			thrown = err;
		}

		expect(isRedirect(thrown)).toBe(true);
		expect(thrown).toMatchObject({ status: 307, location: '/documents/notes/plan?mode=edit' });
	});
});
