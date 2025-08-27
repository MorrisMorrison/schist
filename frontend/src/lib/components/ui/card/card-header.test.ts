import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '$lib/test/component-utils.js';
import CardHeader from './card-header.svelte';

describe('CardHeader', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
	});

	it('renders', () => {
		const { container } = render(CardHeader);

		const cardHeader = container.querySelector('div');
		expect(cardHeader).toBeInTheDocument();
	});

	it('forwards props', () => {
		const { container } = render(CardHeader, {
			props: {
				'data-testid': 'my-card-header',
				id: 'header-1',
				'aria-label': 'Card header section'
			}
		});

		const cardHeader = container.querySelector('div');
		expect(cardHeader).toHaveAttribute('data-testid', 'my-card-header');
		expect(cardHeader).toHaveAttribute('id', 'header-1');
		expect(cardHeader).toHaveAttribute('aria-label', 'Card header section');
	});
});
