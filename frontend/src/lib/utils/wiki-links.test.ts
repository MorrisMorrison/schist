import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';

vi.mock('#lib/utils/markdown-cache.ts', () => ({ getCachedDocuments: vi.fn() }));

import { goto } from '$app/navigation';
import { getCachedDocuments } from '#lib/utils/markdown-cache.ts';
import { wikiLinksExtension } from './wiki-links';

let view: EditorView;

function mount(doc: string) {
	const parent = document.createElement('div');
	document.body.appendChild(parent);
	view = new EditorView({
		state: EditorState.create({ doc, extensions: [wikiLinksExtension()] }),
		parent
	});
	return view;
}

const links = () => Array.from(view.contentDOM.querySelectorAll<HTMLElement>('.cm-wiki-link'));

// The plugin debounces decoration updates by 750ms.
const waitForLinks = (count: number) =>
	vi.waitFor(() => expect(links()).toHaveLength(count), { timeout: 3000 });

describe('wikiLinksExtension', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		view?.dom.parentElement?.remove();
		view?.destroy();
		vi.restoreAllMocks();
	});

	it('decorates existing and missing links, skipping code', async () => {
		vi.mocked(getCachedDocuments).mockResolvedValue([
			{ metaData: { title: 'Alpha Page', path: '/notes/alpha' }, content: '' }
		] as never);

		mount('See [[Alpha Page]] or [[Beta Page|the beta]], not `[[Code]]`.');
		await waitForLinks(2);

		const [alpha, beta] = links();
		expect(alpha.textContent).toBe('[[Alpha Page]]');
		expect(alpha.title).toBe('Go to Alpha Page');
		expect(alpha.classList.contains('cm-wiki-link-broken')).toBe(false);
		expect(beta.textContent).toBe('[[the beta]]');
		expect(beta.title).toBe('Document "Beta Page" does not exist (click to create)');
		expect(beta.classList.contains('cm-wiki-link-broken')).toBe(true);
		expect(view.contentDOM.textContent).toContain('`[[Code]]`');
	});

	it('navigates to the resolved document, or to the editor for a missing one', async () => {
		vi.mocked(getCachedDocuments).mockResolvedValue([
			{ metaData: { title: 'Gamma Page', path: '/deep/gamma' }, content: '' }
		] as never);

		mount('[[gamma page]] [[Delta Page]]');
		await waitForLinks(2);

		links()[0].click();
		await vi.waitFor(() => expect(goto).toHaveBeenCalledWith('/documents/deep/gamma'));
		links()[1].click();
		await vi.waitFor(() => expect(goto).toHaveBeenCalledWith('/edit/delta-page'));
	});

	it('re-decorates after edits', async () => {
		vi.mocked(getCachedDocuments).mockResolvedValue([]);

		mount('nothing yet');
		await new Promise((r) => setTimeout(r, 900));
		expect(links()).toHaveLength(0);

		view.dispatch({ changes: { from: view.state.doc.length, insert: ' [[Epsilon Page]]' } });
		await waitForLinks(1);
	});

	it('treats a failed lookup as a missing document', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.mocked(getCachedDocuments).mockRejectedValue(new Error('down'));

		mount('[[Zeta Page]]');
		await waitForLinks(1);

		expect(links()[0].classList.contains('cm-wiki-link-broken')).toBe(true);
	});
});
