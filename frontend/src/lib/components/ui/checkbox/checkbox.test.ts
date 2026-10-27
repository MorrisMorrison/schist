import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, user } from '#lib/test/component-utils.ts';
import Checkbox from './checkbox.svelte';

describe('Checkbox', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
	});

	it('renders unchecked checkbox by default', () => {
		const { container } = render(Checkbox);

		const checkbox = container.querySelector('[role="checkbox"]');
		expect(checkbox).toBeInTheDocument();
		expect(checkbox).toHaveAttribute('aria-checked', 'false');
		expect(checkbox).toHaveAttribute('data-state', 'unchecked');
		expect(checkbox).toHaveAttribute('data-testid', 'checkbox');
	});

	it('renders checked checkbox when checked prop is true', () => {
		const { container } = render(Checkbox, {
			props: { checked: true }
		});

		const checkbox = container.querySelector('[role="checkbox"]');
		expect(checkbox).toHaveAttribute('aria-checked', 'true');
		expect(checkbox).toHaveAttribute('data-state', 'checked');

		// Check for checkmark svg
		const svg = checkbox?.querySelector('svg');
		expect(svg).toBeInTheDocument();
		expect(svg).toHaveClass('h-3', 'w-3');
	});

	it('applies checked styling when checked', () => {
		const { container } = render(Checkbox, {
			props: { checked: true }
		});

		const checkbox = container.querySelector('[role="checkbox"]');
		expect(checkbox).toHaveClass('bg-primary', 'text-primary-foreground', 'border-primary');
	});

	it('handles disabled state', () => {
		const { container } = render(Checkbox, {
			props: { disabled: true }
		});

		const checkbox = container.querySelector('[role="checkbox"]');
		expect(checkbox).toHaveAttribute('disabled');
		expect(checkbox).toHaveAttribute('aria-disabled', 'true');
		expect(checkbox).toHaveClass('disabled:cursor-not-allowed', 'disabled:opacity-50');
	});

	it('calls onCheckedChange when clicked', async () => {
		const onCheckedChange = vi.fn();
		const { container } = render(Checkbox, {
			props: { onCheckedChange }
		});

		const checkbox = container.querySelector('[role="checkbox"]') as HTMLElement;
		await user.click(checkbox);

		expect(onCheckedChange).toHaveBeenCalledWith(true);
	});

	it('does not call onCheckedChange when disabled', async () => {
		const onCheckedChange = vi.fn();
		const { container } = render(Checkbox, {
			props: { disabled: true, onCheckedChange }
		});

		const checkbox = container.querySelector('[role="checkbox"]') as HTMLElement;
		await user.click(checkbox);

		expect(onCheckedChange).not.toHaveBeenCalled();
	});

	it('renders hidden input when name is provided', () => {
		const { container } = render(Checkbox, {
			props: {
				name: 'accept-terms',
				value: 'yes',
				required: true
			}
		});

		const hiddenInput = container.querySelector('input[type="checkbox"]');
		expect(hiddenInput).toBeInTheDocument();
		expect(hiddenInput).toHaveAttribute('name', 'accept-terms');
		expect(hiddenInput).toHaveAttribute('value', 'yes');
		expect(hiddenInput).toHaveAttribute('required');
		expect(hiddenInput).toHaveClass('sr-only');
	});

	it('applies custom className', () => {
		const { container } = render(Checkbox, {
			props: { class: 'custom-checkbox' }
		});

		const checkbox = container.querySelector('[role="checkbox"]');
		expect(checkbox).toHaveClass('custom-checkbox');
	});

	it('has proper accessibility attributes', () => {
		const { container } = render(Checkbox);

		const checkbox = container.querySelector('button');
		expect(checkbox).toHaveAttribute('type', 'button');
		expect(checkbox).toHaveAttribute('role', 'checkbox');
		expect(checkbox).toHaveClass('focus-visible:ring-2', 'focus-visible:ring-offset-2');
	});
});
