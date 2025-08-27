import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, user } from '$lib/test/component-utils';
import Button from './button.svelte';

describe('Button', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
	});

	it('renders as button by default', () => {
		const { container } = render(Button);
		const button = container.querySelector('button');
		expect(button).toBeInTheDocument();
	});

	it('renders as anchor when href is provided', () => {
		const { container } = render(Button, { props: { href: '/test' } });
		const anchor = container.querySelector('a');
		expect(anchor).toBeInTheDocument();
		expect(anchor).toHaveAttribute('href', '/test');
	});

	it('handles click events', async () => {
		const onClick = vi.fn();
		const { container } = render(Button, { props: { onclick: onClick } });
		const button = container.querySelector('button');

		if (button) {
			await user.click(button);
			expect(onClick).toHaveBeenCalledTimes(1);
		}
	});

	it('respects disabled state', async () => {
		const onClick = vi.fn();
		const { container } = render(Button, { props: { onclick: onClick, disabled: true } });
		const button = container.querySelector('button');

		if (button) {
			expect(button).toBeDisabled();
			await user.click(button);
			expect(onClick).not.toHaveBeenCalled();
		}
	});

	it('forwards custom props', () => {
		const { container } = render(Button, {
			props: { class: 'custom-class', 'data-testid': 'test-button' }
		});
		const button = container.querySelector('button');
		expect(button).toHaveClass('custom-class');
		expect(button).toHaveAttribute('data-testid', 'test-button');
	});
});
