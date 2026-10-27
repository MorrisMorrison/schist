import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '#lib/test/component-utils.ts';
import Separator from './separator.svelte';

describe('Separator', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
	});

	it('renders horizontal separator by default', () => {
		const { container } = render(Separator);

		const separator = container.querySelector('div');
		expect(separator).toBeInTheDocument();
		expect(separator).toHaveClass('h-[1px]', 'w-full');
		expect(separator).toHaveAttribute('role', 'none');
		expect(separator).toHaveAttribute('aria-orientation', 'horizontal');
	});

	it('renders vertical separator when specified', () => {
		const { container } = render(Separator, {
			props: { orientation: 'vertical' }
		});

		const separator = container.querySelector('div');
		expect(separator).toHaveClass('h-full', 'w-[1px]');
		expect(separator).toHaveAttribute('aria-orientation', 'vertical');
	});

	it('applies custom className', () => {
		const { container } = render(Separator, {
			props: { class: 'custom-class' }
		});

		const separator = container.querySelector('div');
		expect(separator).toHaveClass('custom-class');
	});

	it('has proper accessibility when not decorative', () => {
		const { container } = render(Separator, {
			props: { decorative: false }
		});

		const separator = container.querySelector('div');
		expect(separator).toHaveAttribute('role', 'separator');
	});

	it('forwards other props to the element', () => {
		const { container } = render(Separator, {
			props: {
				'data-testid': 'my-separator',
				id: 'separator-1'
			}
		});

		const separator = container.querySelector('div');
		expect(separator).toHaveAttribute('data-testid', 'my-separator');
		expect(separator).toHaveAttribute('id', 'separator-1');
	});
});
