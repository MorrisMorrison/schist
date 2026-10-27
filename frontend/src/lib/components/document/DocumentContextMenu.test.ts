import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import type { Document } from '#lib/api/types.ts';
import { waitForPointerEvents } from '#lib/test/dialog.ts';
import DocumentContextMenu from './DocumentContextMenu.svelte';

const doc: Document = { metaData: { title: 'Plan', path: '/plan', slug: 'plan' }, content: '' };

function setup(overrides: Record<string, unknown> = {}) {
	const handlers = { onClose: vi.fn(), onRename: vi.fn(), onDelete: vi.fn(), onExport: vi.fn() };
	const result = render(DocumentContextMenu, {
		props: { document: doc, position: { x: 40, y: 60 }, isOpen: true, ...handlers, ...overrides }
	});
	return { ...handlers, ...result };
}

async function openedMenu() {
	const menu = await screen.findByRole('menu', { name: 'Document actions' });
	await waitFor(() => expect(menu).toHaveFocus());
	return menu;
}

describe('DocumentContextMenu', () => {
	afterEach(async () => {
		cleanup();
		await waitForPointerEvents();
	});

	it('opens at the given position', async () => {
		setup();

		const menu = await openedMenu();
		expect(menu).toHaveAttribute('data-testid', 'document-context-menu');
		await waitFor(() => {
			const rect = menu.getBoundingClientRect();
			expect(Math.round(rect.top)).toBe(60);
			expect(Math.round(rect.left)).toBeGreaterThanOrEqual(40);
		});
	});

	it('renders nothing when closed or without a document', () => {
		setup({ isOpen: false });
		expect(screen.queryByRole('menu')).not.toBeInTheDocument();
		cleanup();

		setup({ document: null });
		expect(screen.queryByRole('menu')).not.toBeInTheDocument();
	});

	it.each([
		['Export', 'onExport'],
		['Rename', 'onRename'],
		['Delete', 'onDelete']
	] as const)('%s runs its action and closes the menu', async (label, handler) => {
		const h = setup();

		await userEvent.click(await screen.findByRole('menuitem', { name: label }));

		expect(h[handler]).toHaveBeenCalledWith(doc);
		expect(h.onClose).toHaveBeenCalledTimes(1);
	});

	it('marks Delete as destructive', async () => {
		setup();

		expect(await screen.findByRole('menuitem', { name: 'Delete' })).toHaveAttribute(
			'data-variant',
			'destructive'
		);
	});

	it('hides Export without an export handler', async () => {
		setup({ onExport: undefined });

		await openedMenu();
		expect(screen.queryByRole('menuitem', { name: 'Export' })).not.toBeInTheDocument();
	});

	it('closes on Escape and on a press outside', async () => {
		const h = setup();
		await openedMenu();

		await userEvent.keyboard('{Enter}');
		expect(h.onClose).not.toHaveBeenCalled();
		await userEvent.keyboard('{Escape}');
		expect(h.onClose).toHaveBeenCalledTimes(1);

		cleanup();
		const h2 = setup();
		await openedMenu();
		await userEvent.click(document.body);
		await waitFor(() => expect(h2.onClose).toHaveBeenCalledTimes(1));
	});

	it('moves through the items with the arrow keys', async () => {
		const h = setup();
		await openedMenu();

		await userEvent.keyboard('{ArrowDown}');
		await userEvent.keyboard('{ArrowDown}');
		await userEvent.keyboard('{Enter}');

		expect(h.onRename).toHaveBeenCalledWith(doc);
	});
});
