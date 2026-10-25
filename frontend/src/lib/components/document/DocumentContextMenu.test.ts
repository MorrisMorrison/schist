import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import type { Document } from '$lib/api/types';
import DocumentContextMenu from './DocumentContextMenu.svelte';

const doc: Document = { metaData: { title: 'Plan', path: '/plan', slug: 'plan' }, content: '' };

function setup(overrides: Record<string, unknown> = {}) {
	const handlers = { onClose: vi.fn(), onRename: vi.fn(), onDelete: vi.fn(), onExport: vi.fn() };
	render(DocumentContextMenu, {
		props: { document: doc, position: { x: 40, y: 60 }, isOpen: true, ...handlers, ...overrides }
	});
	return handlers;
}

describe('DocumentContextMenu', () => {
	afterEach(() => cleanup());

	it('renders at the given position', () => {
		setup();

		const menu = screen.getByRole('menu', { name: 'Document actions' });
		expect(menu.style.left).toBe('40px');
		expect(menu.style.top).toBe('60px');
	});

	it('renders nothing when closed or without a document', () => {
		setup({ isOpen: false });
		expect(screen.queryByRole('menu')).not.toBeInTheDocument();
		cleanup();

		setup({ document: null });
		expect(screen.queryByRole('menu')).not.toBeInTheDocument();
	});

	it('exports, renames and deletes, closing each time', async () => {
		const h = setup();

		await fireEvent.click(screen.getByRole('button', { name: 'Export' }));
		expect(h.onExport).toHaveBeenCalledWith(doc);
		await fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
		expect(h.onRename).toHaveBeenCalledWith(doc);
		await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
		expect(h.onDelete).toHaveBeenCalledWith(doc);

		expect(h.onClose).toHaveBeenCalledTimes(3);
	});

	it('hides Export without an export handler', () => {
		setup({ onExport: undefined });

		expect(screen.queryByRole('button', { name: 'Export' })).not.toBeInTheDocument();
	});

	it('closes on Escape only', async () => {
		const h = setup();
		const menu = screen.getByRole('menu');

		await fireEvent.keyDown(menu, { key: 'Enter' });
		expect(h.onClose).not.toHaveBeenCalled();

		await fireEvent.keyDown(menu, { key: 'Escape' });
		expect(h.onClose).toHaveBeenCalledTimes(1);
	});

	it('keeps clicks inside the menu from reaching the page', async () => {
		setup();
		const outside = vi.fn();
		document.body.addEventListener('click', outside);

		await fireEvent.click(screen.getByRole('menu'));

		expect(outside).not.toHaveBeenCalled();
		document.body.removeEventListener('click', outside);
	});
});
