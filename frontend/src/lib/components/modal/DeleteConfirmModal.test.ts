import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import DeleteConfirmModal from './DeleteConfirmModal.svelte';

describe('DeleteConfirmModal', () => {
	const onConfirm = vi.fn();
	const onCancel = vi.fn();

	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it('renders the default title, description and confirm text', () => {
		render(DeleteConfirmModal, { props: { open: true, onConfirm, onCancel } });
		expect(screen.getByRole('heading', { name: 'Delete Page' })).toBeInTheDocument();
		expect(screen.getByText(/this action cannot be undone/i)).toBeInTheDocument();
		expect(screen.getByTestId('confirm-delete-button')).toHaveTextContent('Delete');
	});

	it('renders custom texts', () => {
		render(DeleteConfirmModal, {
			props: {
				open: true,
				title: 'Delete folder',
				description: 'Really?',
				confirmText: 'Remove',
				onConfirm,
				onCancel
			}
		});
		expect(screen.getByRole('heading', { name: 'Delete folder' })).toBeInTheDocument();
		expect(screen.getByText('Really?')).toBeInTheDocument();
		expect(screen.getByTestId('confirm-delete-button')).toHaveTextContent('Remove');
	});

	it('awaits an async onConfirm', async () => {
		let done = false;
		const asyncConfirm = vi.fn(async () => {
			await Promise.resolve();
			done = true;
		});
		render(DeleteConfirmModal, { props: { open: true, onConfirm: asyncConfirm, onCancel } });
		await userEvent.click(screen.getByTestId('confirm-delete-button'));
		expect(asyncConfirm).toHaveBeenCalledTimes(1);
		await vi.waitFor(() => expect(done).toBe(true));
	});

	it('calls onConfirm, and onCancel from the button and Escape', async () => {
		render(DeleteConfirmModal, { props: { open: true, onConfirm, onCancel } });
		await userEvent.click(screen.getByTestId('confirm-delete-button'));
		expect(onConfirm).toHaveBeenCalledTimes(1);
		await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		expect(onCancel).toHaveBeenCalledTimes(1);
		await userEvent.keyboard('{Escape}');
		expect(onCancel).toHaveBeenCalledTimes(2);
	});

	it('disables both buttons and shows progress while deleting', () => {
		render(DeleteConfirmModal, { props: { open: true, isDeleting: true, onConfirm, onCancel } });
		expect(screen.getByTestId('confirm-delete-button')).toBeDisabled();
		expect(screen.getByTestId('confirm-delete-button')).toHaveTextContent('Deleting...');
		expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
	});

	it('renders nothing when closed', () => {
		render(DeleteConfirmModal, { props: { open: false, onConfirm, onCancel } });
		expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument();
	});
});
