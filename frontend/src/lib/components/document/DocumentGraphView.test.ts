import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import type { Document, WikiLink } from '#lib/api/types.ts';
import { goto } from '$app/navigation';
import DocumentGraphView from './DocumentGraphView.svelte';
import LazyDocumentGraphView from './LazyDocumentGraphView.svelte';

// Capture the graph's ResizeObserver callback so a test can simulate a resize.
const resizeCallbacks: ResizeObserverCallback[] = [];
class FakeResizeObserver {
	constructor(cb: ResizeObserverCallback) {
		resizeCallbacks.push(cb);
	}
	observe() {}
	unobserve() {}
	disconnect() {}
}
const originalResizeObserver = globalThis.ResizeObserver;

beforeEach(() => {
	resizeCallbacks.length = 0;
	globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
});

afterEach(() => {
	globalThis.ResizeObserver = originalResizeObserver;
});

const current: Document = {
	metaData: { title: 'Plan', path: '/plan', slug: 'plan' },
	content: ''
};
const backlinks: Document[] = [
	{ metaData: { title: 'Roadmap', path: '/roadmap', slug: 'roadmap' }, content: '' }
];
const outgoing: WikiLink[] = [
	{ target: 'Budget', display_text: 'Budget', path: '/budget', is_valid: true },
	{ target: 'Roadmap', display_text: 'Roadmap', path: '/roadmap', is_valid: true },
	{ target: 'Gone', display_text: 'Gone', path: '/gone', is_valid: false }
];

function nodes(container: HTMLElement) {
	return Array.from(container.querySelectorAll<SVGGElement>('g.graph-node'));
}

function node(container: HTMLElement, title: string) {
	return nodes(container).find((n) => n.textContent === title)!;
}

async function rendered(container: HTMLElement) {
	await vi.waitFor(() => expect(nodes(container).length).toBeGreaterThan(0));
}

describe('DocumentGraphView', () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it('shows an empty state without links', () => {
		render(DocumentGraphView, {
			props: { currentDocument: current, backlinks: [], outgoingLinks: [outgoing[2]] }
		});

		expect(screen.getByText('No links found')).toBeInTheDocument();
	});

	it('draws a node per linked document and a line per link', async () => {
		const { container } = render(DocumentGraphView, {
			props: { currentDocument: current, backlinks, outgoingLinks: outgoing }
		});
		await rendered(container);

		// Plan, Roadmap (deduplicated) and Budget; the invalid link is skipped.
		expect(nodes(container).map((n) => n.textContent)).toEqual(['Plan', 'Roadmap', 'Budget']);
		expect(container.querySelectorAll('line.graph-link')).toHaveLength(3);
		expect(node(container, 'Plan').querySelector('circle')).toHaveAttribute('r', '25');
		expect(node(container, 'Roadmap').querySelector('circle')).toHaveAttribute('fill', '#10b981');
		expect(node(container, 'Budget').querySelector('circle')).toHaveAttribute('fill', '#3b82f6');
		expect(screen.getByText('Backlinks (1)')).toBeInTheDocument();
		expect(screen.getByText('Outgoing Links (2)')).toBeInTheDocument();
		await vi.waitFor(() =>
			expect(screen.queryByText('Initializing graph...')).not.toBeInTheDocument()
		);
	});

	it('positions nodes as the simulation ticks', async () => {
		const { container } = render(DocumentGraphView, {
			props: { currentDocument: current, backlinks, outgoingLinks: outgoing }
		});
		await rendered(container);

		await vi.waitFor(() =>
			expect(node(container, 'Budget').getAttribute('transform')).toMatch(/^translate\(/)
		);
		expect(container.querySelector('line.graph-link')?.getAttribute('x1')).not.toBeNull();
	});

	it('navigates to a clicked node but not to the current document', async () => {
		const { container } = render(DocumentGraphView, {
			props: { currentDocument: current, backlinks, outgoingLinks: outgoing }
		});
		await rendered(container);

		node(container, 'Budget').dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(goto).toHaveBeenCalledWith('/documents/budget');

		node(container, 'Plan').dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(goto).toHaveBeenCalledTimes(1);
	});

	it('lets nodes be dragged', async () => {
		const { container } = render(DocumentGraphView, {
			props: { currentDocument: current, backlinks, outgoingLinks: outgoing }
		});
		await rendered(container);
		const target = node(container, 'Budget');
		const opts = { bubbles: true, view: window, clientX: 10, clientY: 10, button: 0 };

		target.dispatchEvent(new MouseEvent('mousedown', opts));
		window.dispatchEvent(new MouseEvent('mousemove', { ...opts, clientX: 80, clientY: 90 }));
		window.dispatchEvent(new MouseEvent('mouseup', { ...opts, clientX: 80, clientY: 90 }));

		await vi.waitFor(() => expect(target.getAttribute('transform')).toMatch(/^translate\(/));
	});

	it('redraws when it is resized', async () => {
		const { container } = render(DocumentGraphView, {
			props: { currentDocument: current, backlinks, outgoingLinks: outgoing }
		});
		await rendered(container);
		await vi.waitFor(() =>
			expect(screen.queryByText('Initializing graph...')).not.toBeInTheDocument()
		);
		const wrapper = container.firstElementChild as HTMLElement;
		wrapper.style.width = '1200px';
		wrapper.style.height = '500px';

		resizeCallbacks.forEach((cb) => cb([], {} as ResizeObserver));

		await vi.waitFor(() =>
			expect(container.querySelector('svg')?.getAttribute('width')).toBe('1200')
		);
	});
});

describe('LazyDocumentGraphView', () => {
	afterEach(() => cleanup());

	it('loads the graph component on mount', async () => {
		const { container } = render(LazyDocumentGraphView, {
			props: { currentDocument: current, backlinks, outgoingLinks: outgoing }
		});

		expect(screen.getByText('Loading graph...')).toBeInTheDocument();
		await rendered(container);
		expect(screen.queryByText('Loading graph...')).not.toBeInTheDocument();
	});
});
