import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('$lib/stores/documents.svelte', () => ({
	documentActions: {
		checkDocumentExists: vi.fn(),
		moveDocumentPath: vi.fn(),
		loadDocuments: vi.fn()
	},
	folderActions: {
		moveFolder: vi.fn(),
		loadFolderTree: vi.fn()
	}
}));

import { documentActions, folderActions } from '$lib/stores/documents.svelte';
import { useDragAndDrop } from './useDragAndDrop.svelte';

beforeEach(() => {
	vi.clearAllMocks();
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe('useDragAndDrop', () => {
	const folder = { path: '/a', name: 'a' } as never;
	const page = { metaData: { path: '/a/doc' } } as never;

	function dragEvent(type: string, target?: EventTarget) {
		const event = new DragEvent(type, { dataTransfer: new DataTransfer(), cancelable: true });
		if (target) Object.defineProperty(event, 'target', { value: target });
		return event;
	}

	beforeEach(() => {
		vi.mocked(folderActions.moveFolder).mockResolvedValue({} as never);
		vi.mocked(folderActions.loadFolderTree).mockResolvedValue([]);
		vi.mocked(documentActions.moveDocumentPath).mockResolvedValue({} as never);
		vi.mocked(documentActions.loadDocuments).mockResolvedValue([]);
	});

	it('records the dragged item and its payload', () => {
		const dnd = useDragAndDrop(true);
		const source = document.createElement('div');
		const start = dragEvent('dragstart', source);

		dnd.handleDragStart(start, 'folder', '/a', folder);

		expect(dnd.isDragging).toBe(true);
		expect(dnd.draggedItem).toEqual({ type: 'folder', path: '/a', data: folder });
		expect(JSON.parse(start.dataTransfer!.getData('application/json'))).toEqual({
			type: 'folder',
			path: '/a',
			data: folder
		});

		dnd.handleDragEnd();
		expect(dnd.isDragging).toBe(false);
		expect(dnd.draggedItem).toBeNull();
	});

	it('ignores a dragstart without a data transfer', () => {
		const dnd = useDragAndDrop(true);

		dnd.handleDragStart(new DragEvent('dragstart'), 'page', '/x', page);

		expect(dnd.isDragging).toBe(false);
	});

	it('accepts valid targets and refuses itself or its own subfolders', () => {
		const dnd = useDragAndDrop(true);
		dnd.handleDragStart(dragEvent('dragstart'), 'folder', '/a', folder);

		const self = dragEvent('dragover');
		dnd.handleDragOver(self, '/a');
		expect(self.defaultPrevented).toBe(false);

		const child = dragEvent('dragover');
		dnd.handleDragOver(child, '/a/sub');
		dnd.handleDragEnter(dragEvent('dragenter'), '/a/sub');
		expect(child.defaultPrevented).toBe(false);
		expect(dnd.dropTarget).toBeNull();

		const other = dragEvent('dragover');
		dnd.handleDragOver(other, '/b');
		dnd.handleDragEnter(dragEvent('dragenter'), '/b');
		expect(other.defaultPrevented).toBe(true);
		expect(dnd.dragOverTarget).toBe('/b');
		expect(dnd.dropTarget).toBe('/b');
	});

	it('clears the highlight when leaving the target itself, not a child', () => {
		const dnd = useDragAndDrop(true);
		dnd.handleDragStart(dragEvent('dragstart'), 'page', '/a/doc', page);
		dnd.handleDragOver(dragEvent('dragover'), '/b');
		dnd.handleDragEnter(dragEvent('dragenter'), '/b');

		const target = document.createElement('div');
		const fromChild = dragEvent('dragleave', document.createElement('span'));
		Object.defineProperty(fromChild, 'currentTarget', { value: target });
		dnd.handleDragLeave(fromChild, '/b');
		expect(dnd.dropTarget).toBe('/b');

		const fromSelf = dragEvent('dragleave', target);
		Object.defineProperty(fromSelf, 'currentTarget', { value: target });
		dnd.handleDragLeave(fromSelf, '/b');
		expect(dnd.dropTarget).toBeNull();
		expect(dnd.dragOverTarget).toBeNull();
	});

	it('moves a folder into the target and reloads the tree and pages', async () => {
		const dnd = useDragAndDrop(true);
		dnd.handleDragStart(dragEvent('dragstart'), 'folder', '/a', folder);

		await dnd.handleDrop(dragEvent('drop'), '/b');

		expect(folderActions.moveFolder).toHaveBeenCalledWith('/a', '/b/a');
		expect(folderActions.loadFolderTree).toHaveBeenCalled();
		expect(documentActions.loadDocuments).toHaveBeenCalled();
		expect(dnd.isDragging).toBe(false);
	});

	it('moves a page to the root without reloading pages when they are hidden', async () => {
		const dnd = useDragAndDrop(false);
		dnd.handleDragStart(dragEvent('dragstart'), 'page', '/a/doc', page);

		await dnd.handleDrop(dragEvent('drop'), '/');

		expect(documentActions.moveDocumentPath).toHaveBeenCalledWith('/a/doc', '/doc');
		expect(documentActions.loadDocuments).not.toHaveBeenCalled();
	});

	it('refuses drops onto itself or its subfolders, and survives a failed move', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const dnd = useDragAndDrop(true);

		await dnd.handleDrop(dragEvent('drop'), '/b'); // nothing dragged
		dnd.handleDragStart(dragEvent('dragstart'), 'folder', '/a', folder);
		await dnd.handleDrop(dragEvent('drop'), '/a');
		await dnd.handleDrop(dragEvent('drop'), '/a/sub');
		expect(folderActions.moveFolder).not.toHaveBeenCalled();

		vi.mocked(folderActions.moveFolder).mockRejectedValueOnce(new Error('conflict'));
		await dnd.handleDrop(dragEvent('drop'), '/b');
		expect(console.error).toHaveBeenCalled();
		expect(dnd.isDragging).toBe(false);
		expect(dnd.draggedItem).toBeNull();
	});
});
