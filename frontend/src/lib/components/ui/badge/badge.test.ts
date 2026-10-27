import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '#lib/test/component-utils.ts';
import Badge from './badge.svelte';

describe('Badge', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
	});

	it('renders as span by default', () => {
		const { container } = render(Badge);

		const badge = container.querySelector('span');
		expect(badge).toBeInTheDocument();
		expect(container.querySelector('a')).not.toBeInTheDocument();
	});

	it('renders as anchor when href is provided', () => {
		const { container } = render(Badge, {
			props: { href: 'https://example.com' }
		});

		const badge = container.querySelector('a');
		expect(badge).toBeInTheDocument();
		expect(badge).toHaveAttribute('href', 'https://example.com');
		expect(container.querySelector('span')).not.toBeInTheDocument();
	});

	it('renders destructive variant', () => {
		const { container } = render(Badge, {
			props: { variant: 'destructive' }
		});

		const badge = container.querySelector('span');
		expect(badge).toBeInTheDocument();
	});

	it('forwards props to element', () => {
		const { container } = render(Badge, {
			props: {
				'data-testid': 'my-badge',
				id: 'badge-1'
			}
		});

		const badge = container.querySelector('span');
		expect(badge).toHaveAttribute('data-testid', 'my-badge');
		expect(badge).toHaveAttribute('id', 'badge-1');
	});
});
