import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '$lib/test/component-utils.js';
import PageContainer from './page-container.svelte';
import { pageContainerVariants } from './index.js';

const page = (container: HTMLElement) =>
	container.querySelector('[data-slot="page-container"]') as HTMLElement;

describe('PageContainer', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
	});

	it('defaults to the reading width, centred and padded', () => {
		const { container } = render(PageContainer);

		expect(page(container)).toHaveAttribute('data-width', 'reading');
		expect(page(container)).toHaveClass('max-w-[47rem]', 'mx-auto', 'w-full', 'p-6');
	});

	it('has a wide width for browse pages', () => {
		const { container } = render(PageContainer, { props: { width: 'wide' } });

		expect(page(container)).toHaveAttribute('data-width', 'wide');
		expect(page(container)).toHaveClass('max-w-6xl', 'mx-auto');
		expect(page(container)).not.toHaveClass('max-w-[47rem]');
	});

	it('passes through classes and attributes', () => {
		const { container } = render(PageContainer, {
			props: { class: 'flex-1', 'data-testid': 'page' } as Record<string, unknown>
		});

		expect(container.querySelector('[data-testid="page"]')).toHaveClass('flex-1', 'mx-auto');
	});

	it('lets a class override its spacing', () => {
		const classes = pageContainerVariants({ class: 'pt-0 space-y-0' }).split(' ');

		expect(classes).toContain('max-w-[47rem]');
		expect(classes).toContain('pt-0');
		expect(classes).not.toContain('space-y-8');
	});
});
