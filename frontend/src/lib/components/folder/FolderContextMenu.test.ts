import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import type { Folder } from '$lib/api/types';
import { waitForPointerEvents } from '$lib/test/dialog';
import FolderContextMenu from './FolderContextMenu.svelte';

const folder: Folder = {
	name: 'notes',
	path: '/notes',
	created: '',
	document_count: 0,
	sub_folders: []
};
const root: Folder = { name: '/', path: '/', created: '', document_count: 0, sub_folders: [] };

function setup(overrides: Record<string, unknown> = {}) {
	const handlers = {
		onClose: vi.fn(),
		onCreateFolder: vi.fn(),
		onCreateDocument: vi.fn(),
		onRename: vi.fn(),
		onDelete: vi.fn(),
		onFolderExport: vi.fn(),
		onExportAll: vi.fn()
	};
	render(FolderContextMenu, {
		props: { folder, position: { x: 30, y: 50 }, isOpen: true, ...handlers, ...overrides }
	});
	return handlers;
}

const items = async () =>
	(await screen.findAllByRole('menuitem')).map((item) => item.textContent?.trim());

describe('FolderContextMenu', () => {
	afterEach(async () => {
		cleanup();
		await waitForPointerEvents();
	});

	it('offers every action for a folder, with the test id the e2e suite uses', async () => {
		setup();

		const menu = await screen.findByRole('menu', { name: 'Folder actions' });
		expect(menu).toHaveAttribute('data-testid', 'context-menu');
		expect(await items()).toEqual([
			'Create Subfolder',
			'Create Document',
			'Export',
			'Rename',
			'Delete'
		]);
	});

	it('routes each action with the folder and closes', async () => {
		const h = setup();
		await userEvent.click(await screen.findByRole('menuitem', { name: 'Create Subfolder' }));
		expect(h.onCreateFolder).toHaveBeenCalledWith('/notes');
		expect(h.onClose).toHaveBeenCalledTimes(1);
		cleanup();

		for (const [label, handler, arg] of [
			['Create Document', 'onCreateDocument', '/notes'],
			['Export', 'onFolderExport', folder],
			['Rename', 'onRename', folder],
			['Delete', 'onDelete', folder]
		] as const) {
			const handlers = setup();
			await userEvent.click(await screen.findByRole('menuitem', { name: label }));
			expect(handlers[handler]).toHaveBeenCalledWith(arg);
			cleanup();
			await waitForPointerEvents();
		}
	});

	it('exports everything and hides rename / delete for the root', async () => {
		const h = setup({ folder: root });

		expect(await items()).toEqual(['Create Subfolder', 'Create Document', 'Export']);
		await userEvent.click(screen.getByRole('menuitem', { name: 'Export' }));
		expect(h.onExportAll).toHaveBeenCalled();
		expect(h.onFolderExport).not.toHaveBeenCalled();
	});

	it('hides Export without export handlers and renders nothing when closed', async () => {
		setup({ onFolderExport: undefined, onExportAll: undefined });
		expect(await items()).not.toContain('Export');
		cleanup();

		setup({ isOpen: false });
		await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
	});
});
