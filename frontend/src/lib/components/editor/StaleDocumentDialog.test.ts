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

	it('says the page was deleted and offers to keep or discard mine', async () => {
		const onDiscard = vi.fn();
		const onKeepMine = vi.fn();
		render(StaleDocumentDialog, {
			props: { open: true, reason: 'deleted', onLoadCurrent: vi.fn(), onKeepMine, onDiscard }
		});

		expect(await screen.findByText('This page was deleted since you opened it')).toBeVisible();
		expect(screen.queryByRole('button', { name: 'Load the new version' })).toBeNull();
		await userEvent.click(screen.getByRole('button', { name: 'Keep mine' }));
		expect(onKeepMine).toHaveBeenCalledOnce();
		await userEvent.click(screen.getByRole('button', { name: 'Discard my changes' }));
		expect(onDiscard).toHaveBeenCalledOnce();
	});

	it('says the page can no longer be read', async () => {
		render(StaleDocumentDialog, {
			props: { open: true, reason: 'unreadable', onLoadCurrent: vi.fn(), onKeepMine: vi.fn() }
		});
		expect(await screen.findByText('This page can no longer be read')).toBeVisible();
		expect(screen.getByRole('button', { name: 'Discard my changes' })).toBeVisible();
	});

	it('renders nothing while closed', () => {
		render(StaleDocumentDialog, {
			props: { open: false, onLoadCurrent: vi.fn(), onKeepMine: vi.fn() }
		});
		expect(screen.queryByText('This page changed since you opened it')).toBeNull();
	});
});
