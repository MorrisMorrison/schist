import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import TabsHarness from '#lib/test/ui/TabsHarness.svelte';

function setup(props: Record<string, unknown> = {}) {
	const onValueChange = vi.fn();
	render(TabsHarness, { props: { onValueChange, ...props } });
	return { onValueChange };
}

describe('Tabs', () => {
	afterEach(() => cleanup());

	it('renders a tablist with the active tab and only its panel', () => {
		setup();

		const list = screen.getByRole('tablist', { name: 'Settings' });
		expect(list).toHaveAttribute('data-slot', 'tabs-list');
		expect(list).toHaveAttribute('data-variant', 'default');
		expect(screen.getByRole('tab', { name: 'Account' })).toHaveAttribute('aria-selected', 'true');
		expect(screen.getByRole('tab', { name: 'Password' })).toHaveAttribute('aria-selected', 'false');
		expect(screen.getByRole('tabpanel')).toHaveTextContent('Account panel');
		expect(screen.getByText('Password panel')).not.toBeVisible();
	});

	it('switches tabs on click', async () => {
		const { onValueChange } = setup();

		await userEvent.click(screen.getByRole('tab', { name: 'Password' }));

		expect(onValueChange).toHaveBeenCalledWith('password');
		expect(screen.getByTestId('tabs-value')).toHaveTextContent('password');
		expect(screen.getByRole('tabpanel')).toHaveTextContent('Password panel');
	});

	it('moves with the arrow keys and skips disabled tabs', async () => {
		const { onValueChange } = setup();

		screen.getByRole('tab', { name: 'Account' }).focus();
		await userEvent.keyboard('{ArrowRight}');

		expect(screen.getByRole('tab', { name: 'Password' })).toHaveFocus();
		expect(onValueChange).toHaveBeenCalledWith('password');
		expect(screen.getByRole('tab', { name: 'Billing' })).toBeDisabled();
	});

	it('only activates on Enter in manual mode', async () => {
		const { onValueChange } = setup({ activationMode: 'manual' });

		screen.getByRole('tab', { name: 'Account' }).focus();
		await userEvent.keyboard('{ArrowRight}');
		expect(onValueChange).not.toHaveBeenCalled();

		await userEvent.keyboard('{Enter}');
		expect(onValueChange).toHaveBeenCalledWith('password');
	});

	it('styles triggers after the list variant', () => {
		setup({ variant: 'line' });

		expect(screen.getByRole('tablist')).toHaveAttribute('data-variant', 'line');
		expect(screen.getByRole('tablist')).toHaveClass('border-b');
		expect(screen.getByRole('tab', { name: 'Account' })).toHaveClass('border-b-2');
		cleanup();

		setup();
		expect(screen.getByRole('tablist')).toHaveClass('bg-muted');
		expect(screen.getByRole('tab', { name: 'Account' })).toHaveClass('rounded-md');
	});
});
