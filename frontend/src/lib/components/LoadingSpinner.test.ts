import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '$lib/test/component-utils.js';
import LoadingSpinner from './LoadingSpinner.svelte';

describe('LoadingSpinner', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
	});

	it('renders with default size', () => {
		const { container } = render(LoadingSpinner);

		const wrapper = container.querySelector('div');
		const spinner = wrapper?.querySelector('div');
		expect(spinner).toBeInTheDocument();
		expect(spinner).toHaveClass('w-6', 'h-6', 'animate-spin', 'border-2');
	});

	it('applies small size correctly', () => {
		const { container } = render(LoadingSpinner, {
			props: { size: 'sm' }
		});

		const wrapper = container.querySelector('div');
		const spinner = wrapper?.querySelector('div');
		expect(spinner).toHaveClass('w-4', 'h-4');
	});

	it('applies large size correctly', () => {
		const { container } = render(LoadingSpinner, {
			props: { size: 'lg' }
		});

		const wrapper = container.querySelector('div');
		const spinner = wrapper?.querySelector('div');
		expect(spinner).toHaveClass('w-8', 'h-8');
	});

	it('applies custom className to wrapper', () => {
		const { container } = render(LoadingSpinner, {
			props: { class: 'custom-wrapper' }
		});

		const wrapper = container.querySelector('div');
		expect(wrapper).toHaveClass('custom-wrapper', 'flex', 'items-center', 'justify-center');
	});

	it('has proper spinner styling', () => {
		const { container } = render(LoadingSpinner);

		const wrapper = container.querySelector('div');
		const spinner = wrapper?.querySelector('div');
		expect(spinner).toHaveClass(
			'border-muted',
			'border-t-foreground',
			'rounded-full',
			'animate-spin'
		);
	});
});
