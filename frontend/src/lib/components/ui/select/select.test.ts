import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import SelectHarness from '$lib/test/ui/SelectHarness.svelte';
import { waitForPointerEvents } from '$lib/test/dialog';
import { selectTriggerVariants } from './index.js';

const items = [
	{ value: 'apple', label: 'Apple' },
	{ value: 'banana', label: 'Banana' },
	{ value: 'cherry', label: 'Cherry', disabled: true }
];

function setup(props: Record<string, unknown> = {}) {
	const onValueChange = vi.fn();
	render(SelectHarness, { props: { items, onValueChange, ...props } });
	return { onValueChange, trigger: screen.getByLabelText('Fruit') };
}

describe('Select', () => {
	afterEach(async () => {
		await waitForPointerEvents();
		cleanup();
	});

	it('renders a labelled listbox button showing the selected label or the placeholder', () => {
		const { trigger } = setup({ placeholder: 'Pick a fruit' });

		expect(trigger.tagName).toBe('BUTTON');
		expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
		expect(trigger).toHaveAttribute('data-slot', 'select-trigger');
		expect(trigger).toHaveTextContent('Pick a fruit');
		cleanup();

		setup({ value: 'banana' });
		expect(screen.getByLabelText('Fruit')).toHaveTextContent('Banana');
	});

	it('opens on click, lists the items and selects one', async () => {
		const { trigger, onValueChange } = setup({ value: 'apple' });

		await userEvent.click(trigger);
		const listbox = await screen.findByRole('listbox');
		expect(listbox).toHaveAttribute('data-slot', 'select-content');
		expect(screen.getAllByRole('option').map((o) => o.textContent?.trim())).toEqual([
			'Apple',
			'Banana',
			'Cherry'
		]);
		expect(screen.getByRole('option', { name: 'Apple' })).toHaveAttribute('aria-selected', 'true');

		await userEvent.click(screen.getByRole('option', { name: 'Banana' }));

		expect(onValueChange).toHaveBeenCalledWith('banana');
		await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
		expect(screen.getByTestId('fruit-value')).toHaveTextContent('banana');
		expect(trigger).toHaveTextContent('Banana');
	});

	it('is keyboard operable and skips disabled items', async () => {
		const { trigger, onValueChange } = setup({ value: 'apple' });

		trigger.focus();
		await userEvent.keyboard('{Enter}');
		await screen.findByRole('listbox');
		await userEvent.keyboard('{ArrowDown}');
		await userEvent.keyboard('{ArrowDown}');
		await userEvent.keyboard('{Enter}');

		expect(onValueChange).toHaveBeenCalledWith('banana');
		expect(onValueChange).not.toHaveBeenCalledWith('cherry');
		await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
	});

	it('closes on Escape without changing the value', async () => {
		const { trigger, onValueChange } = setup({ value: 'apple' });

		await userEvent.click(trigger);
		await screen.findByRole('listbox');
		await userEvent.keyboard('{Escape}');

		await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
		expect(onValueChange).not.toHaveBeenCalled();
	});

	it('renders group labels and separators', async () => {
		const { trigger } = setup({ grouped: true });

		await userEvent.click(trigger);
		await screen.findByRole('listbox');
		expect(screen.getByText('Fruits')).toHaveAttribute('data-slot', 'select-label');
		expect(document.querySelector('[data-slot="select-separator"]')).toHaveAttribute(
			'role',
			'separator'
		);
		await userEvent.keyboard('{Escape}');
	});

	it('does not open when disabled', async () => {
		const { trigger } = setup({ disabled: true });

		expect(trigger).toBeDisabled();
		await userEvent.click(trigger);
		expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
	});

	it('has default and small trigger sizes', () => {
		const { trigger } = setup({ size: 'sm' });

		expect(trigger).toHaveAttribute('data-size', 'sm');
		expect(trigger).toHaveClass('h-8');
		expect(selectTriggerVariants({ size: 'default' })).toContain('h-9');
	});
});
