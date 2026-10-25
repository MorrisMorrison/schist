import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import '../app.css';

const pageState = vi.hoisted(() => ({
	status: 404,
	error: null as { message: string } | null,
	url: new URL('http://localhost/documents/missing-page')
}));

vi.mock('$app/state', () => ({ page: pageState }));

import ErrorPage from './+error.svelte';

const TRANSPARENT = 'rgba(0, 0, 0, 0)';

describe('error page', () => {
	afterEach(() => {
		cleanup();
		pageState.status = 404;
		pageState.error = null;
		pageState.url = new URL('http://localhost/documents/missing-page');
	});

	it('offers to create a missing page', () => {
		render(ErrorPage);

		expect(screen.getByRole('heading', { name: 'Page Not Found' })).toBeInTheDocument();
		const create = screen.getByRole('link', { name: 'Create This Page' });
		expect(create).toHaveAttribute('href', '/new?title=missing%20page');
		expect(screen.getByRole('link', { name: 'Go Home' })).toHaveAttribute('href', '/');
	});

	it('styles the actions as filled buttons', () => {
		render(ErrorPage);

		for (const name of ['Create This Page', 'Go Home']) {
			const link = screen.getByRole('link', { name });
			expect(getComputedStyle(link).backgroundColor).not.toBe(TRANSPARENT);
		}
	});

	it('shows the message and a home link for a 404 without a slug', () => {
		pageState.url = new URL('http://localhost/');
		pageState.error = { message: 'Nothing here' };
		render(ErrorPage);

		expect(screen.getByText('Nothing here')).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Go Home' })).toHaveAttribute('href', '/');
	});

	it('offers a retry for other errors', () => {
		pageState.status = 500;
		pageState.error = { message: 'Boom' };
		render(ErrorPage);

		expect(screen.getByRole('heading', { name: '500 Error' })).toBeInTheDocument();
		expect(screen.getByText('Boom')).toBeInTheDocument();
		const retry = screen.getByRole('button', { name: 'Try Again' });
		expect(getComputedStyle(retry).backgroundColor).not.toBe(TRANSPARENT);
		expect(screen.getByRole('link', { name: 'Go Home' })).toHaveAttribute('href', '/');
	});
});
