import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, user } from '$lib/test/component-utils.js';
import ToggleSlider from './ToggleSlider.svelte';

describe('ToggleSlider', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
	});

	it('renders unchecked by default', () => {
		const { container } = render(ToggleSlider);

		const toggle = container.querySelector('[role="switch"]');
		expect(toggle).toBeInTheDocument();
		expect(toggle).toHaveAttribute('aria-checked', 'false');
	});

	it('renders checked when prop is true', () => {
		const { container } = render(ToggleSlider, {
			props: { checked: true }
		});

		const toggle = container.querySelector('[role="switch"]');
		expect(toggle).toHaveAttribute('aria-checked', 'true');
	});

	it('calls onCheckedChange when clicked', async () => {
		const onCheckedChange = vi.fn();
		const { container } = render(ToggleSlider, {
			props: { onCheckedChange }
		});

		const toggle = container.querySelector('[role="switch"]') as HTMLElement;
		await user.click(toggle);

		expect(onCheckedChange).toHaveBeenCalledWith(true);
	});

	it('toggles from checked to unchecked', async () => {
		const onCheckedChange = vi.fn();
		const { container } = render(ToggleSlider, {
			props: { checked: true, onCheckedChange }
		});

		const toggle = container.querySelector('[role="switch"]') as HTMLElement;
		await user.click(toggle);

		expect(onCheckedChange).toHaveBeenCalledWith(false);
	});

	it('does not call onCheckedChange when disabled', async () => {
		const onCheckedChange = vi.fn();
		const { container } = render(ToggleSlider, {
			props: { disabled: true, onCheckedChange }
		});

		const toggle = container.querySelector('[role="switch"]') as HTMLElement;
		await user.click(toggle);

		expect(onCheckedChange).not.toHaveBeenCalled();
	});
});
