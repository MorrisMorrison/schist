import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import ToggleGroupHarness from '$lib/test/ui/ToggleGroupHarness.svelte';

describe('ToggleGroup', () => {
	afterEach(() => cleanup());

	it('renders a single-choice group with the chosen item checked', () => {
		render(ToggleGroupHarness);

		const group = screen.getByRole('group', { name: 'Alignment' });
		expect(group).toHaveAttribute('data-slot', 'toggle-group');
		expect(screen.getByRole('radio', { name: 'Left' })).toHaveAttribute('aria-checked', 'true');
		expect(screen.getByRole('radio', { name: 'Left' })).toHaveAttribute('data-state', 'on');
		expect(screen.getByRole('radio', { name: 'Right' })).toHaveAttribute('aria-checked', 'false');
		expect(screen.getByRole('radio', { name: 'Center' })).toBeDisabled();
	});

	it('selects one item at a time on click', async () => {
		const onSingleChange = vi.fn();
		render(ToggleGroupHarness, { props: { onSingleChange } });

		await userEvent.click(screen.getByRole('radio', { name: 'Right' }));

		expect(onSingleChange).toHaveBeenCalledWith('right');
		expect(screen.getByTestId('toggle-value')).toHaveTextContent('right');
		expect(screen.getByRole('radio', { name: 'Left' })).toHaveAttribute('aria-checked', 'false');
	});

	it('moves focus with the arrow keys and toggles with Enter / Space', async () => {
		const onSingleChange = vi.fn();
		render(ToggleGroupHarness, { props: { onSingleChange } });

		screen.getByRole('radio', { name: 'Left' }).focus();
		await userEvent.keyboard('{ArrowRight}');
		// The disabled item is skipped.
		expect(screen.getByRole('radio', { name: 'Right' })).toHaveFocus();
		expect(onSingleChange).not.toHaveBeenCalled();

		await userEvent.keyboard('{Enter}');
		expect(onSingleChange).toHaveBeenCalledWith('right');
		await userEvent.keyboard('{ArrowLeft}');
		await userEvent.keyboard(' ');
		expect(onSingleChange).toHaveBeenLastCalledWith('left');
	});

	it('toggles several items in a multiple group', async () => {
		const onMultipleChange = vi.fn();
		render(ToggleGroupHarness, { props: { type: 'multiple', onMultipleChange } });

		const bold = screen.getByRole('button', { name: 'Bold' });
		expect(bold).toHaveAttribute('aria-pressed', 'false');
		await userEvent.click(bold);
		await userEvent.click(screen.getByRole('button', { name: 'Italic' }));

		expect(onMultipleChange).toHaveBeenLastCalledWith(['bold', 'italic']);
		expect(bold).toHaveAttribute('aria-pressed', 'true');

		await userEvent.click(bold);
		expect(onMultipleChange).toHaveBeenLastCalledWith(['italic']);
	});

	it('styles items after the group variant and size, unless an item overrides them', () => {
		render(ToggleGroupHarness, { props: { variant: 'segmented', size: 'sm' } });

		const group = screen.getByRole('group');
		expect(group).toHaveAttribute('data-variant', 'segmented');
		expect(group).toHaveClass('bg-muted/50', 'p-0.5');
		expect(screen.getByRole('radio', { name: 'Left' })).toHaveClass(
			'h-7',
			'data-[state=on]:bg-background'
		);
		expect(screen.getByRole('radio', { name: 'Right' })).toHaveClass('h-10');
		cleanup();

		render(ToggleGroupHarness, { props: { variant: 'outline' } });
		expect(screen.getByRole('radio', { name: 'Left' })).toHaveClass('border', 'h-9');
	});
});
