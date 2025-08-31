import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '$lib/test/component-utils.js';
import CardContent from './card-content.svelte';

describe('CardContent', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
	});

	it('renders', () => {
		const { container } = render(CardContent);

		const cardContent = container.querySelector('div');
		expect(cardContent).toBeInTheDocument();
	});

	it('forwards props', () => {
		const { container } = render(CardContent, {
			props: {
				'data-testid': 'my-card-content',
				id: 'content-1',
				'aria-label': 'Card content section'
			}
		});

		const cardContent = container.querySelector('div');
		expect(cardContent).toHaveAttribute('data-testid', 'my-card-content');
		expect(cardContent).toHaveAttribute('id', 'content-1');
		expect(cardContent).toHaveAttribute('aria-label', 'Card content section');
	});
});
