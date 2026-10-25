import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import UnsavedChangesModal from './UnsavedChangesModal.svelte';

describe('UnsavedChangesModal', () => {
	const onSave = vi.fn().mockResolvedValue(undefined);
	const onDiscard = vi.fn();
	const onCancel = vi.fn();
	const base = { open: true, onSave, onDiscard, onCancel };

	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it('names the document, defaulting to "this document"', () => {
		const { unmount } = render(UnsavedChangesModal, { props: base });
		expect(screen.getByText('this document')).toBeInTheDocument();
		unmount();
		render(UnsavedChangesModal, { props: { ...base, documentTitle: 'Roadmap' } });
		expect(screen.getByText('Roadmap')).toBeInTheDocument();
	});

	it('routes save, discard and cancel to their callbacks', async () => {
		render(UnsavedChangesModal, { props: base });
		await userEvent.click(screen.getByTestId('save-and-continue-button'));
		expect(onSave).toHaveBeenCalledTimes(1);
		await userEvent.click(screen.getByTestId('discard-and-continue-button'));
		expect(onDiscard).toHaveBeenCalledTimes(1);
		await userEvent.click(screen.getByTestId('cancel-navigation-button'));
		expect(onCancel).toHaveBeenCalledTimes(1);
	});

	it('cancels on Escape', async () => {
		render(UnsavedChangesModal, { props: base });
		await userEvent.keyboard('{Escape}');
		expect(onCancel).toHaveBeenCalledTimes(1);
	});

	it('disables all actions while saving', () => {
		render(UnsavedChangesModal, { props: { ...base, isSaving: true } });
		expect(screen.getByTestId('save-and-continue-button')).toHaveTextContent('Saving...');
		for (const id of [
			'save-and-continue-button',
			'discard-and-continue-button',
			'cancel-navigation-button'
		]) {
			expect(screen.getByTestId(id)).toBeDisabled();
		}
	});
});
