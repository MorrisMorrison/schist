import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, user } from '$lib/test/component-utils.js';
import ErrorAlert from './ErrorAlert.svelte';

describe('ErrorAlert', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
	});

	it('renders error message', () => {
		const { container } = render(ErrorAlert, {
			props: { error: 'Something went wrong' }
		});

		const alert = container.querySelector('[role="alert"]');
		expect(alert).toBeInTheDocument();
		expect(container).toHaveTextContent('Something went wrong');
	});

	it('passes extra attributes such as test ids to the alert', () => {
		const { container } = render(ErrorAlert, {
			props: { error: 'Nope', 'data-testid': 'login-error' }
		});

		expect(container.querySelector('[role="alert"]')).toHaveAttribute('data-testid', 'login-error');
	});

	it('applies error variant by default', () => {
		const { container } = render(ErrorAlert, {
			props: { error: 'Error message' }
		});

		const alert = container.querySelector('[role="alert"]');
		expect(alert).toHaveClass('border-destructive/50', 'text-destructive');
	});

	it('applies warning variant correctly', () => {
		const { container } = render(ErrorAlert, {
			props: { error: 'Warning message', variant: 'warning' }
		});

		const alert = container.querySelector('[role="alert"]');
		expect(alert).toHaveClass('border-amber-200', 'bg-amber-50', 'text-amber-800');
	});

	it('applies info variant correctly', () => {
		const { container } = render(ErrorAlert, {
			props: { error: 'Info message', variant: 'info' }
		});

		const alert = container.querySelector('[role="alert"]');
		expect(alert).toHaveClass('border-blue-200', 'bg-blue-50', 'text-blue-800');
	});

	it('shows appropriate icon for each variant', () => {
		// Test error icon (AlertCircle)
		const { container: errorContainer } = render(ErrorAlert, {
			props: { error: 'Error', variant: 'error' }
		});
		let svg = errorContainer.querySelector('svg');
		expect(svg).toBeInTheDocument();

		// Test warning icon (AlertTriangle)
		const { container: warningContainer } = render(ErrorAlert, {
			props: { error: 'Warning', variant: 'warning' }
		});
		svg = warningContainer.querySelector('svg');
		expect(svg).toBeInTheDocument();

		// Test info icon (Info)
		const { container: infoContainer } = render(ErrorAlert, {
			props: { error: 'Info', variant: 'info' }
		});
		svg = infoContainer.querySelector('svg');
		expect(svg).toBeInTheDocument();
	});

	it('shows dismiss button when onDismiss is provided', () => {
		const onDismiss = vi.fn();
		const { container } = render(ErrorAlert, {
			props: { error: 'Dismissible error', onDismiss }
		});

		const dismissButton = container.querySelector('button');
		expect(dismissButton).toBeInTheDocument();

		// Should have X icon
		const xIcon = dismissButton?.querySelector('svg');
		expect(xIcon).toBeInTheDocument();
	});

	it('does not show dismiss button when onDismiss is not provided', () => {
		const { container } = render(ErrorAlert, {
			props: { error: 'Non-dismissible error' }
		});

		const dismissButton = container.querySelector('button');
		expect(dismissButton).not.toBeInTheDocument();
	});

	it('calls onDismiss when dismiss button is clicked', async () => {
		const onDismiss = vi.fn();
		const { container } = render(ErrorAlert, {
			props: { error: 'Dismissible error', onDismiss }
		});

		const dismissButton = container.querySelector('button') as HTMLElement;
		await user.click(dismissButton);

		expect(onDismiss).toHaveBeenCalledTimes(1);
	});

	it('applies custom className', () => {
		const { container } = render(ErrorAlert, {
			props: { error: 'Custom styled error', class: 'custom-alert-class' }
		});

		const alert = container.querySelector('[role="alert"]');
		expect(alert).toHaveClass('custom-alert-class');
	});

	it('has proper accessibility role', () => {
		const { container } = render(ErrorAlert, {
			props: { error: 'Accessible error' }
		});

		const alert = container.querySelector('[role="alert"]');
		expect(alert).toBeInTheDocument();
	});
});
