import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '#lib/test/component-utils.ts';
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

	it.each([
		['success', 'bg-green-50'],
		['warning', 'bg-amber-50'],
		['info', 'bg-blue-50'],
		['muted', 'bg-muted'],
		['destructive', 'text-destructive'],
		['default', 'bg-card']
	] as const)('styles the %s variant', (variant, expected) => {
		const { container } = render(Alert, { props: { variant } });

		const alert = container.querySelector('[data-slot="alert"]');
		expect(alert).toHaveClass(expected);
		expect(alert).toHaveAttribute('data-variant', variant);
	});

	it('lets a static note override the alert role', () => {
		const { container } = render(Alert, { props: { variant: 'muted', role: 'note' } });

		expect(container.querySelector('[role="alert"]')).not.toBeInTheDocument();
		expect(container.querySelector('[role="note"]')).toBeInTheDocument();
	});
});
