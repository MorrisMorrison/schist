import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import StaleDocumentDialog from './StaleDocumentDialog.svelte';

describe('StaleDocumentDialog', () => {
	afterEach(() => cleanup());

	it('explains the conflict and offers both choices', async () => {
		const onLoadCurrent = vi.fn();
		const onKeepMine = vi.fn();
		render(StaleDocumentDialog, { props: { open: true, onLoadCurrent, onKeepMine } });

		expect(await screen.findByText('This page changed since you opened it')).toBeVisible();
		await userEvent.click(screen.getByRole('button', { name: 'Load the new version' }));
		expect(onLoadCurrent).toHaveBeenCalledOnce();
		await userEvent.click(screen.getByRole('button', { name: 'Keep mine' }));
		expect(onKeepMine).toHaveBeenCalledOnce();
	});

	it('renders nothing while closed', () => {
		render(StaleDocumentDialog, {
			props: { open: false, onLoadCurrent: vi.fn(), onKeepMine: vi.fn() }
		});
		expect(screen.queryByText('This page changed since you opened it')).toBeNull();
	});
});
