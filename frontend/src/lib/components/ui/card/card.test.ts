import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '#lib/test/component-utils.ts';
import Card from './card.svelte';

describe('Card', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
	});

	it('renders', () => {
		const { container } = render(Card);

		const card = container.querySelector('div');
		expect(card).toBeInTheDocument();
	});

	it('forwards props', () => {
		const { container } = render(Card, {
			props: {
				'data-testid': 'my-card',
				id: 'card-1',
				'aria-label': 'Card component'
			}
		});

		const card = container.querySelector('div');
		expect(card).toHaveAttribute('data-testid', 'my-card');
		expect(card).toHaveAttribute('id', 'card-1');
		expect(card).toHaveAttribute('aria-label', 'Card component');
	});
});
