import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import RadioGroupHarness from '#lib/test/ui/RadioGroupHarness.svelte';

function setup(props: Record<string, unknown> = {}) {
	const onValueChange = vi.fn();
	render(RadioGroupHarness, { props: { onValueChange, ...props } });
	return { onValueChange };
}

describe('RadioGroup', () => {
	afterEach(() => cleanup());

	it('renders a labelled radiogroup with the checked item', () => {
		setup({ value: 'large' });

		const group = screen.getByRole('radiogroup', { name: 'Size' });
		expect(group).toHaveAttribute('data-slot', 'radio-group');
		expect(screen.getAllByRole('radio')).toHaveLength(3);
		expect(screen.getByRole('radio', { name: 'Large' })).toHaveAttribute('aria-checked', 'true');
		expect(screen.getByRole('radio', { name: 'Small' })).toHaveAttribute('aria-checked', 'false');
		expect(
			screen
				.getByRole('radio', { name: 'Large' })
				.querySelector('[data-slot="radio-group-indicator"] svg')
		).toBeInTheDocument();
	});

	it('selects an item on click or through its label', async () => {
		const { onValueChange } = setup({ value: 'large' });

		await userEvent.click(screen.getByRole('radio', { name: 'Small' }));
		expect(onValueChange).toHaveBeenLastCalledWith('small');
		expect(screen.getByTestId('size-value')).toHaveTextContent('small');

		await userEvent.click(screen.getByText('Large'));
		expect(onValueChange).toHaveBeenLastCalledWith('large');
		expect(screen.getByRole('radio', { name: 'Large' })).toHaveAttribute('aria-checked', 'true');
	});

	it('moves the selection with the arrow keys, skipping disabled items', async () => {
		const { onValueChange } = setup({ value: 'small' });

		screen.getByRole('radio', { name: 'Small' }).focus();
		await userEvent.keyboard('{ArrowDown}');

		expect(onValueChange).toHaveBeenLastCalledWith('large');
		expect(screen.getByRole('radio', { name: 'Large' })).toHaveFocus();
		expect(screen.getByRole('radio', { name: 'Medium' })).toBeDisabled();
	});

	it('ignores clicks when the group is disabled', async () => {
		const { onValueChange } = setup({ value: 'small', disabled: true });

		await userEvent.click(screen.getByRole('radio', { name: 'Large' }));

		expect(onValueChange).not.toHaveBeenCalled();
		expect(screen.getByTestId('size-value')).toHaveTextContent('small');
	});

	it('submits its value through a hidden input when named', () => {
		setup({ value: 'large', name: 'size' });

		expect(document.querySelector('input[name="size"]')).toHaveValue('large');
	});
});
