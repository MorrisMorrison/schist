import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '$lib/test/component-utils.js';
import Alert from './alert.svelte';

describe('Alert', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
	});

	it('renders with correct accessibility role', () => {
		const { container } = render(Alert);

		const alert = container.querySelector('[role="alert"]');
		expect(alert).toBeInTheDocument();
	});

	it('renders destructive variant', () => {
		const { container } = render(Alert, {
			props: { variant: 'destructive' }
		});

		const alert = container.querySelector('[role="alert"]');
		expect(alert).toBeInTheDocument();
	});

	it('forwards props to element', () => {
		const { container } = render(Alert, {
			props: {
				'data-testid': 'my-alert',
				id: 'alert-1'
			}
		});

		const alert = container.querySelector('[role="alert"]');
		expect(alert).toHaveAttribute('data-testid', 'my-alert');
		expect(alert).toHaveAttribute('id', 'alert-1');
	});
});
