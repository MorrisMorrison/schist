import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import { goto } from '$app/navigation';
import Breadcrumbs from './Breadcrumbs.svelte';

const pageState = vi.hoisted(() => ({ url: new URL('http://localhost/folders/projects') }));

vi.mock('$app/state', () => ({ page: pageState }));

function setPathname(pathname: string) {
	pageState.url = new URL(`http://localhost${pathname}`);
}

describe('Breadcrumbs', () => {
	afterEach(() => {
		cleanup();
		vi.mocked(goto).mockClear();
		setPathname('/folders/projects');
	});

	it('renders a link for every folder segment on a folder page', () => {
		setPathname('/folders/projects/web');
		render(Breadcrumbs, { props: { path: '/projects/web' } });

		expect(screen.getByRole('button', { name: 'Go to home' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Go to projects' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Go to web' })).toBeInTheDocument();
	});

	it('drops the document segment on a document page and shows the title instead', () => {
		setPathname('/documents/projects/web/launch-plan');
		render(Breadcrumbs, {
			props: { path: '/projects/web/launch-plan', currentDocumentTitle: 'Launch Plan' }
		});

		expect(screen.getByRole('button', { name: 'Go to projects' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Go to web' })).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Go to launch-plan' })).not.toBeInTheDocument();
		const current = screen.getByText('Launch Plan');
		expect(current).toHaveAttribute('aria-current', 'page');
	});

	it('does not repeat the title when it equals the last segment', () => {
		render(Breadcrumbs, { props: { path: '/projects', currentDocumentTitle: 'projects' } });

		expect(screen.getByRole('button', { name: 'Go to projects' })).toBeInTheDocument();
		expect(document.querySelector('[aria-current="page"]')).toBeNull();
	});

	it('navigates to the folders root from Home', async () => {
		render(Breadcrumbs, { props: { path: '/projects' } });

		screen.getByRole('button', { name: 'Go to home' }).click();

		expect(goto).toHaveBeenCalledWith('/folders');
	});

	it('navigates to the folder of a clicked segment', () => {
		setPathname('/folders/projects/web');
		render(Breadcrumbs, { props: { path: '/projects/web' } });

		screen.getByRole('button', { name: 'Go to projects' }).click();
		expect(goto).toHaveBeenCalledWith('/folders/projects');

		screen.getByRole('button', { name: 'Go to web' }).click();
		expect(goto).toHaveBeenCalledWith('/folders/projects/web');
	});

	it('renders only Home for an empty path', () => {
		render(Breadcrumbs, {});

		expect(screen.getAllByRole('listitem')).toHaveLength(1);
	});
});
