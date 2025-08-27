import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '$lib/test/component-utils.js';
import Label from './label.svelte';

describe('Label', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
	});

	it('renders as label element', () => {
		const { container } = render(Label);

		const label = container.querySelector('label');
		expect(label).toBeInTheDocument();
		expect(label?.tagName.toLowerCase()).toBe('label');
	});

	it('applies for attribute', () => {
		const { container } = render(Label, {
			props: { for: 'input-field' }
		});

		const label = container.querySelector('label');
		expect(label).toHaveAttribute('for', 'input-field');
	});

	it('forwards props to element', () => {
		const { container } = render(Label, {
			props: {
				'data-testid': 'my-label',
				id: 'label-1'
			}
		});

		const label = container.querySelector('label');
		expect(label).toHaveAttribute('data-testid', 'my-label');
		expect(label).toHaveAttribute('id', 'label-1');
	});
});
