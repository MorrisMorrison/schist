import { describe, it, expect, vi, afterEach } from 'vitest';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';

vi.mock('#lib/utils/markdown-cache.ts', () => ({ getCachedTags: vi.fn() }));

import { getCachedTags } from '#lib/utils/markdown-cache.ts';
import { hashtagExtension } from './hashtag-extension';
import { processHashtags } from './hashtag-renderer';

let view: EditorView;

function mount(doc: string) {
	const parent = document.createElement('div');
	document.body.appendChild(parent);
	view = new EditorView({
		state: EditorState.create({ doc, extensions: [hashtagExtension()] }),
		parent
	});
}

const tags = () => Array.from(view.contentDOM.querySelectorAll<HTMLElement>('.cm-hashtag'));

describe('hashtagExtension', () => {
	afterEach(() => {
		view?.dom.parentElement?.remove();
		view?.destroy();
		vi.restoreAllMocks();
	});

	it('marks known and new tags differently', async () => {
		vi.mocked(getCachedTags).mockResolvedValue([{ name: 'Go', count: 3 }] as never);

		mount('Learning #go and #rust-lang today');
		await vi.waitFor(() => expect(tags()).toHaveLength(2), { timeout: 3000 });

		const [known, fresh] = tags();
		expect(known.textContent).toBe('#go');
		expect(known.title).toBe('Tag: go');
		expect(known.classList.contains('cm-hashtag-new')).toBe(false);
		expect(fresh.textContent).toBe('#rust-lang');
		expect(fresh.title).toBe('New tag: rust-lang');
		expect(fresh.classList.contains('cm-hashtag-new')).toBe(true);
	});

	it('updates after edits and logs lookup failures', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.mocked(getCachedTags).mockRejectedValueOnce(new Error('down'));

		mount('#first');
		await vi.waitFor(() => expect(warn).toHaveBeenCalled(), { timeout: 3000 });
		expect(tags()).toHaveLength(0);

		vi.mocked(getCachedTags).mockResolvedValue([]);
		view.dispatch({ changes: { from: 0, insert: '#second ' } });
		await vi.waitFor(() => expect(tags()).toHaveLength(2), { timeout: 3000 });
	});
});

describe('processHashtags', () => {
	it('renders each hashtag as a badge span', () => {
		const html = processHashtags('a #tag-1 b #x');
		const doc = new DOMParser().parseFromString(html, 'text/html');
		const spans = Array.from(doc.querySelectorAll('span'));

		expect(spans.map((s) => s.textContent)).toEqual(['#tag-1', '#x']);
		expect(spans[0].title).toBe('Tag: tag-1');
		expect(doc.body.textContent).toBe('a #tag-1 b #x');
	});
});
