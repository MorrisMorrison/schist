import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';

vi.mock('#lib/api/client.ts', () => ({ apiClient: { uploadImage: vi.fn() } }));

import { apiClient } from '#lib/api/client.ts';
import { imagePasteExtension } from './image-paste';

let view: EditorView;
const callbacks = {
	onUploadStart: vi.fn(),
	onUploadProgress: vi.fn(),
	onUploadComplete: vi.fn(),
	onUploadError: vi.fn()
};

function mount(doc = 'Hello ') {
	const parent = document.createElement('div');
	document.body.appendChild(parent);
	view = new EditorView({
		state: EditorState.create({
			doc,
			selection: { anchor: doc.length },
			extensions: [imagePasteExtension(callbacks)]
		}),
		parent
	});
}

function transfer(...files: File[]) {
	const dt = new DataTransfer();
	for (const f of files) dt.items.add(f);
	return dt;
}

function paste(dt: DataTransfer) {
	const event = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
	view.contentDOM.dispatchEvent(event);
	return event;
}

const png = new File(['png'], 'shot.png', { type: 'image/png' });

describe('imagePasteExtension', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(apiClient.uploadImage).mockImplementation(async (_file, onProgress) => {
			onProgress?.(50);
			return { path: '/assets/shot.png', original_name: 'shot.png' } as never;
		});
	});

	afterEach(() => {
		view?.dom.parentElement?.remove();
		view?.destroy();
	});

	it('uploads a pasted image and inserts its markdown at the cursor', async () => {
		mount();

		const event = paste(transfer(png));

		expect(event.defaultPrevented).toBe(true);
		await vi.waitFor(() => expect(callbacks.onUploadComplete).toHaveBeenCalled());
		expect(apiClient.uploadImage).toHaveBeenCalledWith(png, expect.any(Function));
		expect(callbacks.onUploadStart).toHaveBeenCalled();
		expect(callbacks.onUploadProgress).toHaveBeenCalledWith(50);
		const text = view.state.doc.toString();
		expect(text).toMatch(/^Hello !\[shot\.png\]\(\/assets\/shot\.png\?t=\d+ "shot\.png\|large"\)$/);
		expect(view.state.selection.main.head).toBe(text.length);
	});

	it('ignores pastes without supported images', () => {
		mount();

		paste(transfer(new File(['x'], 'a.txt', { type: 'text/plain' })));
		paste(transfer(new File(['x'], 'a.bmp', { type: 'image/bmp' })));

		expect(apiClient.uploadImage).not.toHaveBeenCalled();
	});

	it('reports the API error message when an upload fails', async () => {
		vi.mocked(apiClient.uploadImage).mockRejectedValue(
			new Error(JSON.stringify({ error: 'File too large', code: 'VALIDATION_ERROR' }))
		);
		mount();

		paste(transfer(png));

		await vi.waitFor(() => expect(callbacks.onUploadError).toHaveBeenCalledWith('File too large'));
		expect(view.state.doc.toString()).toBe('Hello ');
	});

	it('uploads dropped images at the drop position', async () => {
		mount('first line');
		const rect = view.contentDOM.getBoundingClientRect();
		const event = new DragEvent('drop', {
			dataTransfer: transfer(png),
			clientX: rect.left + 1,
			clientY: rect.top + 2,
			bubbles: true,
			cancelable: true
		});

		view.contentDOM.dispatchEvent(event);

		expect(event.defaultPrevented).toBe(true);
		await vi.waitFor(() => expect(callbacks.onUploadComplete).toHaveBeenCalled());
		expect(view.state.doc.toString()).toMatch(/^!\[shot\.png\].*first line$/);
	});

	it('ignores drops without images and only accepts file drag-overs', () => {
		mount();
		const drop = new DragEvent('drop', {
			dataTransfer: transfer(new File(['x'], 'a.txt', { type: 'text/plain' })),
			bubbles: true,
			cancelable: true
		});
		view.contentDOM.dispatchEvent(drop);
		expect(apiClient.uploadImage).not.toHaveBeenCalled();

		const dt = transfer(png);
		const over = new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true });
		view.contentDOM.dispatchEvent(over);
		expect(over.defaultPrevented).toBe(true);

		const text = new DataTransfer();
		text.setData('text/plain', 'x');
		const textOver = new DragEvent('dragover', {
			dataTransfer: text,
			bubbles: true,
			cancelable: true
		});
		view.contentDOM.dispatchEvent(textOver);
		expect(textOver.defaultPrevented).toBe(false);
	});
});
