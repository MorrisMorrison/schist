import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';
import { goto } from '$app/navigation';
import { imageLightbox, imageLightboxActions } from '#lib/stores/image-lightbox.svelte.ts';
import type { ParagraphBlock as Block } from '#lib/utils/markdown-blocks.ts';
import ParagraphBlock from './ParagraphBlock.svelte';

const PIXEL =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

function block(text: string): Block {
	return { type: 'paragraph', id: 'p1', text, raw: text };
}

function click(el: Element) {
	const event = new MouseEvent('click', { bubbles: true, cancelable: true });
	el.dispatchEvent(event);
	return event;
}

describe('ParagraphBlock', () => {
	afterEach(() => {
		cleanup();
		imageLightboxActions.close();
		vi.clearAllMocks();
	});

	it('renders sanitized inline HTML', () => {
		const { container } = render(ParagraphBlock, {
			props: { block: block('Hello <strong>world</strong><script>alert(1)</script>') }
		});

		const p = container.querySelector('p')!;
		expect(p.querySelector('strong')).toHaveTextContent('world');
		expect(p.querySelector('script')).toBeNull();
	});

	it('navigates when a wiki link is clicked', () => {
		const { container } = render(ParagraphBlock, {
			props: {
				block: block('see <span class="wiki-link" data-wiki-target="/notes/plan">Plan</span>')
			}
		});

		const event = click(container.querySelector('.wiki-link')!);

		expect(event.defaultPrevented).toBe(true);
		expect(goto).toHaveBeenCalledWith('/documents/notes/plan');
	});

	it('does not navigate for a broken wiki link or one without a target', () => {
		const { container } = render(ParagraphBlock, {
			props: {
				block: block(
					'<span class="wiki-link broken-link" data-wiki-target="/gone">Gone</span> <span class="wiki-link">Bare</span>'
				)
			}
		});
		const [broken, bare] = container.querySelectorAll('.wiki-link');

		expect(click(broken).defaultPrevented).toBe(true);
		expect(click(bare).defaultPrevented).toBe(true);
		expect(goto).not.toHaveBeenCalled();
	});

	it('opens inline images in the lightbox', () => {
		const { container } = render(ParagraphBlock, {
			props: { block: block(`<img src="${PIXEL}" alt="Chart">`) }
		});
		const img = container.querySelector('img')!;
		expect(img).toHaveClass('cursor-pointer');

		click(img);

		expect(imageLightbox.open).toBe(true);
		expect(imageLightbox.src).toBe(PIXEL);
		expect(imageLightbox.alt).toBe('Chart');
	});

	it('ignores clicks on plain text', () => {
		const { container } = render(ParagraphBlock, { props: { block: block('just text') } });

		expect(click(container.querySelector('p')!).defaultPrevented).toBe(false);
		expect(imageLightbox.open).toBe(false);
	});
});
