import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { EditorView } from '@codemirror/view';

vi.mock('$lib/api/client', () => ({
	apiClient: {
		uploadImage: vi.fn(),
		getDocuments: vi.fn().mockResolvedValue([]),
		getDocumentByPath: vi.fn(),
		getAllTags: vi.fn().mockResolvedValue({ tags: [] }),
		getAssetUrl: vi.fn((path: string) => path)
	}
}));

import { apiClient } from '$lib/api/client';
import { settings, settingsActions } from '$lib/stores/settings.svelte';
import { themeStore, type Theme } from '$lib/stores/theme.svelte';
import Editor from './Editor.svelte';
import LazyEditor from './LazyEditor.svelte';

function view(): EditorView {
	const dom = document.querySelector<HTMLElement>('.cm-editor');
	expect(dom).not.toBeNull();
	return EditorView.findFromDOM(dom!)!;
}

const text = () => view().state.doc.toString();

function select(from: number, to: number) {
	view().dispatch({ selection: { anchor: from, head: to } });
}

function typeAtEnd(insert: string) {
	const v = view();
	v.dispatch({ changes: { from: v.state.doc.length, insert } });
}

function shortcut(key: string, extra: KeyboardEventInit = {}) {
	return fireEvent.keyDown(window, { key, ctrlKey: true, ...extra });
}

function toolbarButton(name: string) {
	return screen.getByRole('button', { name });
}

describe('Editor', () => {
	let initialTheme: Theme;
	const initialSettings = { ...settings.app };

	beforeEach(() => {
		initialTheme = themeStore.current;
		themeStore.set('light');
	});

	afterEach(() => {
		cleanup();
		themeStore.set(initialTheme);
		settingsActions.updateAppSetting('alwaysHidePreview', initialSettings.alwaysHidePreview);
		settingsActions.updateAppSetting('alwaysOpenFullscreen', initialSettings.alwaysOpenFullscreen);
		vi.useRealTimers();
		vi.clearAllMocks();
		vi.restoreAllMocks();
	});

	it('renders CodeMirror with the initial content and a live preview', async () => {
		const { container } = render(Editor, { props: { initialContent: '# Hello\n\nWorld' } });

		expect(container.querySelector('.cm-content')).toHaveTextContent('# Hello');
		expect(text()).toBe('# Hello\n\nWorld');
		const preview = screen.getByTestId('markdown-preview');
		await vi.waitFor(() => expect(preview.querySelector('h1')).toHaveTextContent('Hello'));
		expect(screen.getByRole('region', { name: 'Markdown Editor' })).toHaveStyle({
			height: '700px'
		});
	});

	it('reports edits, marks the editor dirty and updates the preview after a pause', async () => {
		const onContentChange = vi.fn();
		render(Editor, { props: { initialContent: 'start', onContentChange } });

		typeAtEnd(' more');

		expect(onContentChange).toHaveBeenLastCalledWith('start more');
		expect(await screen.findByTestId('unsaved-indicator')).toBeInTheDocument();
		await vi.waitFor(() =>
			expect(screen.getByTestId('markdown-preview')).toHaveTextContent('start more')
		);
	});

	describe('toolbar', () => {
		const cases: [string, string][] = [
			['Bold', '**bold text**'],
			['Italic', '*italic text*'],
			['Heading 1', '# Heading 1'],
			['Heading 2', '## Heading 2'],
			['Heading 3', '### Heading 3'],
			['Bullet List', '- List item'],
			['Numbered List', '1. List item'],
			['Inline Code', '`code`'],
			['Quote Block', '> Quote']
		];

		for (const [name, expected] of cases) {
			it(`inserts a ${name} placeholder`, async () => {
				render(Editor, { props: { initialContent: '' } });

				await fireEvent.click(toolbarButton(name));

				expect(text()).toBe(expected);
			});
		}

		it('wraps the selected text', async () => {
			render(Editor, { props: { initialContent: 'make this bold' } });
			select(10, 14);

			await fireEvent.click(toolbarButton('Bold'));

			expect(text()).toBe('make this **bold**');
		});

		it('places the cursor inside a bold placeholder', async () => {
			render(Editor, { props: { initialContent: '' } });

			await fireEvent.click(toolbarButton('Bold'));

			expect(view().state.selection.main.head).toBe('**bold text'.length);
		});

		it('asks for a URL when inserting a link', async () => {
			const prompt = vi.spyOn(window, 'prompt').mockReturnValue('https://schist.dev');
			render(Editor, { props: { initialContent: 'docs' } });
			select(0, 4);

			await fireEvent.click(toolbarButton('Insert Link'));

			expect(prompt).toHaveBeenCalledWith('Enter URL:');
			expect(text()).toBe('[docs](https://schist.dev)');
		});

		it('inserts nothing when the link prompt is cancelled', async () => {
			vi.spyOn(window, 'prompt').mockReturnValue(null);
			render(Editor, { props: { initialContent: 'docs' } });

			await fireEvent.click(toolbarButton('Insert Link'));

			expect(text()).toBe('docs');
		});

		it('is disabled when read-only', async () => {
			render(Editor, { props: { initialContent: 'locked', readonly: true } });

			expect(toolbarButton('Bold')).toBeDisabled();
			expect(view().state.readOnly).toBe(true);
		});
	});

	describe('keyboard shortcuts', () => {
		const cases: [string, KeyboardEventInit, string][] = [
			['b', {}, '**bold text**'],
			['i', {}, '*italic text*'],
			['1', {}, '# Heading 1'],
			['2', {}, '## Heading 2'],
			['3', {}, '### Heading 3'],
			['k', {}, '[link text](https://example.com)'],
			['k', { shiftKey: true }, '[[Document Name]]'],
			['`', {}, '`code`']
		];

		for (const [key, extra, expected] of cases) {
			it(`Ctrl+${extra.shiftKey ? 'Shift+' : ''}${key} formats the text`, async () => {
				render(Editor, { props: { initialContent: '' } });

				await shortcut(key, extra);

				expect(text()).toBe(expected);
			});
		}

		it('ignores keys without a modifier and unknown shortcuts', async () => {
			render(Editor, { props: { initialContent: 'x' } });

			await fireEvent.keyDown(window, { key: 'b' });
			await shortcut('q');

			expect(text()).toBe('x');
		});

		it('works with the meta key', async () => {
			render(Editor, { props: { initialContent: '' } });

			await fireEvent.keyDown(window, { key: 'i', metaKey: true });

			expect(text()).toBe('*italic text*');
		});
	});

	describe('saving', () => {
		it('saves with Ctrl+S and shows when it last saved', async () => {
			const onSave = vi.fn().mockResolvedValue(undefined);
			render(Editor, { props: { initialContent: 'a', onSave, autoSave: { enabled: false } } });
			typeAtEnd('b');

			await shortcut('s');

			await vi.waitFor(() => expect(onSave).toHaveBeenCalledWith('ab'));
			expect(await screen.findByTestId('auto-saved')).toBeInTheDocument();
			expect(screen.queryByTestId('unsaved-indicator')).not.toBeInTheDocument();
		});

		it('does not save a clean document', async () => {
			const onSave = vi.fn();
			render(Editor, { props: { initialContent: 'a', onSave } });

			await shortcut('s');

			expect(onSave).not.toHaveBeenCalled();
		});

		it('auto-saves after the configured interval', async () => {
			const onSave = vi.fn().mockResolvedValue(undefined);
			render(Editor, {
				props: { initialContent: 'a', onSave, autoSave: { intervalInMillis: 20 } }
			});

			typeAtEnd('b');
			typeAtEnd('c');

			await vi.waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
			expect(onSave).toHaveBeenCalledWith('abc');
		});

		it('keeps the document dirty when saving fails', async () => {
			const error = vi.spyOn(console, 'error').mockImplementation(() => {});
			const onSave = vi.fn().mockRejectedValue(new Error('offline'));
			render(Editor, { props: { initialContent: 'a', onSave, autoSave: { enabled: false } } });
			typeAtEnd('b');

			await shortcut('s');

			await vi.waitFor(() => expect(error).toHaveBeenCalled());
			expect(screen.getByTestId('unsaved-indicator')).toBeInTheDocument();
		});
	});

	describe('layout', () => {
		it('toggles the preview', async () => {
			render(Editor, { props: { initialContent: 'x' } });

			await fireEvent.click(screen.getByRole('button', { name: 'Hide Preview' }));
			expect(screen.queryByTestId('markdown-preview')).not.toBeInTheDocument();

			await fireEvent.click(screen.getByRole('button', { name: 'Show Preview' }));
			expect(screen.getByTestId('markdown-preview')).toBeInTheDocument();
		});

		it('starts without the preview when the setting says so', () => {
			settingsActions.updateAppSetting('alwaysHidePreview', true);
			render(Editor, { props: { initialContent: 'x' } });

			expect(screen.queryByTestId('markdown-preview')).not.toBeInTheDocument();
		});

		it('enters and leaves fullscreen with the button, F11 and Escape', async () => {
			render(Editor, { props: { initialContent: 'x' } });

			await fireEvent.click(toolbarButton('Enter Fullscreen'));
			expect(screen.getByRole('dialog', { name: 'Fullscreen Editor' })).toBeInTheDocument();
			expect(screen.getByText('Press F11 or Escape to exit')).toBeInTheDocument();

			await fireEvent.keyDown(window, { key: 'Escape' });
			expect(screen.getByRole('region', { name: 'Markdown Editor' })).toBeInTheDocument();

			await fireEvent.keyDown(window, { key: 'F11' });
			expect(screen.getByRole('dialog', { name: 'Fullscreen Editor' })).toBeInTheDocument();

			await fireEvent.click(toolbarButton('Exit Fullscreen'));
			expect(screen.getByRole('region', { name: 'Markdown Editor' })).toBeInTheDocument();
		});

		it('opens fullscreen from the prop or the setting', () => {
			settingsActions.updateAppSetting('alwaysOpenFullscreen', true);
			render(Editor, { props: { initialContent: 'x' } });

			expect(screen.getByRole('dialog', { name: 'Fullscreen Editor' })).toBeInTheDocument();
			expect(
				screen.queryByRole('button', { name: 'Resize editor height' })
			).not.toBeInTheDocument();
		});

		it('resizes with the handle, never below 200px', async () => {
			render(Editor, { props: { initialContent: 'x' } });
			const editor = screen.getByRole('region', { name: 'Markdown Editor' });
			const handle = screen.getByRole('button', { name: 'Resize editor height' });

			await fireEvent.mouseDown(handle, { clientY: 500 });
			expect(document.body.style.cursor).toBe('ns-resize');
			await fireEvent.mouseMove(document, { clientY: 600 });
			expect(editor).toHaveStyle({ height: '800px' });
			await fireEvent.mouseMove(document, { clientY: -500 });
			expect(editor).toHaveStyle({ height: '200px' });
			await fireEvent.mouseUp(document);
			expect(document.body.style.cursor).toBe('');

			await fireEvent.mouseMove(document, { clientY: 900 });
			expect(editor).toHaveStyle({ height: '200px' });
		});

		it('follows the theme', async () => {
			render(Editor, { props: { initialContent: 'x' } });

			themeStore.set('dark');

			await vi.waitFor(() =>
				expect(screen.getByRole('region', { name: 'Markdown Editor' })).toHaveClass('dark')
			);
			expect(screen.getByTestId('markdown-preview')).toHaveClass('dark');
		});
	});

	describe('scroll sync', () => {
		const long = Array.from({ length: 300 }, (_, i) => `Line ${i}\n`).join('\n');

		it('scrolls the preview along with the editor and back', async () => {
			render(Editor, { props: { initialContent: long } });
			// The test page has no Tailwind, so give both panes a fixed height to scroll in.
			const preview = screen.getByTestId('markdown-preview');
			preview.style.height = '300px';
			preview.style.overflow = 'auto';
			screen.getByTestId('document-content-textarea').style.height = '300px';
			await vi.waitFor(() => expect(preview.scrollHeight).toBeGreaterThan(preview.clientHeight));
			const scroller = view().scrollDOM;
			expect(scroller.scrollHeight).toBeGreaterThan(scroller.clientHeight);

			scroller.scrollTop = (scroller.scrollHeight - scroller.clientHeight) / 2;
			scroller.dispatchEvent(new Event('scroll'));

			await vi.waitFor(() => expect(preview.scrollTop).toBeGreaterThan(0));

			// Let the sync guard expire, then scroll the preview back to the top.
			await new Promise((r) => setTimeout(r, 120));
			preview.scrollTop = 0;
			preview.dispatchEvent(new Event('scroll'));

			await vi.waitFor(() => expect(scroller.scrollTop).toBe(0));
		});
	});

	describe('image paste', () => {
		function pasteImage() {
			const data = new DataTransfer();
			data.items.add(new File(['png'], 'shot.png', { type: 'image/png' }));
			const event = new ClipboardEvent('paste', {
				clipboardData: data,
				bubbles: true,
				cancelable: true
			});
			view().contentDOM.dispatchEvent(event);
		}

		it('uploads a pasted image, inserts it and reports progress', async () => {
			let progress!: (p: number) => void;
			let finish!: () => void;
			vi.mocked(apiClient.uploadImage).mockImplementation((_file, onProgress) => {
				progress = onProgress!;
				return new Promise((resolve) => {
					finish = () => resolve({ path: '/assets/shot.png', original_name: 'shot.png' } as never);
				});
			});
			render(Editor, { props: { initialContent: '' } });

			pasteImage();
			await vi.waitFor(() => expect(apiClient.uploadImage).toHaveBeenCalled());
			expect(await screen.findByText(/Starting upload/)).toBeInTheDocument();

			progress(42.4);
			expect(await screen.findByText(/Uploading... 42%/)).toBeInTheDocument();

			finish();
			expect(await screen.findByText(/Uploaded shot\.png/)).toBeInTheDocument();
			expect(text()).toMatch(/^!\[shot\.png\]\(\/assets\/shot\.png\?t=\d+ "shot\.png\|large"\)$/);
		});

		it('shows an upload error', async () => {
			vi.mocked(apiClient.uploadImage).mockRejectedValue(new Error('Too large'));
			render(Editor, { props: { initialContent: '' } });

			pasteImage();

			expect(await screen.findByText(/Too large/)).toBeInTheDocument();
		});
	});

	it('replaces the content immediately through setContentImmediate', async () => {
		const onContentChange = vi.fn();
		const { component } = render(Editor, { props: { initialContent: 'old', onContentChange } });

		component.setContentImmediate('# Template');

		expect(text()).toBe('# Template');
		expect(onContentChange).toHaveBeenCalledWith('# Template');
		await vi.waitFor(() =>
			expect(screen.getByTestId('markdown-preview').querySelector('h1')).toHaveTextContent(
				'Template'
			)
		);
	});
});

describe('LazyEditor', () => {
	afterEach(() => cleanup());

	it('shows a loader, then the editor, and forwards setContentImmediate', async () => {
		const { component } = render(LazyEditor, { props: { initialContent: 'lazy' } });

		expect(screen.getByText('Loading editor...')).toBeInTheDocument();
		await vi.waitFor(() => expect(document.querySelector('.cm-editor')).not.toBeNull());
		expect(text()).toBe('lazy');

		component.setContentImmediate('replaced');
		expect(text()).toBe('replaced');
	});

	it('ignores setContentImmediate before the editor has loaded', () => {
		const { component } = render(LazyEditor, { props: { initialContent: 'lazy' } });

		expect(() => component.setContentImmediate('early')).not.toThrow();
	});
});
