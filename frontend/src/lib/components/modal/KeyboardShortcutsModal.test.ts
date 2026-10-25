import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import KeyboardShortcutsModal from './KeyboardShortcutsModal.svelte';

describe('KeyboardShortcutsModal', () => {
	const onClose = vi.fn();

	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it('renders nothing when closed', () => {
		render(KeyboardShortcutsModal, { props: { open: false, onClose } });
		expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
	});

	it('lists every shortcut group', () => {
		render(KeyboardShortcutsModal, { props: { open: true, onClose } });
		const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
		expect(dialog).toBeInTheDocument();
		for (const heading of ['Navigation', 'Document Actions', 'UI Controls']) {
			expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
		}
		expect(screen.getByText('Open Quick Switcher')).toBeInTheDocument();
		expect(screen.getByText('Create new folder')).toBeInTheDocument();
		expect(screen.getByText('Download current document')).toBeInTheDocument();
		expect(screen.getByText('Toggle sidebar')).toBeInTheDocument();
	});

	it('closes from the close button', async () => {
		render(KeyboardShortcutsModal, { props: { open: true, onClose } });
		await userEvent.click(screen.getByRole('button', { name: 'Close' }));
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it('closes on Escape but not on other keys', async () => {
		render(KeyboardShortcutsModal, { props: { open: true, onClose } });
		const dialog = screen.getByRole('dialog');
		await fireEvent.keyDown(dialog, { key: 'a' });
		expect(onClose).not.toHaveBeenCalled();
		await fireEvent.keyDown(dialog, { key: 'Escape' });
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it('takes focus when it opens, so Escape works however it was opened', async () => {
		render(KeyboardShortcutsModal, { props: { open: true, onClose } });
		const dialog = screen.getByRole('dialog');
		await vi.waitFor(() => expect(document.activeElement).toBe(dialog));
		await userEvent.keyboard('{Escape}');
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it('closes on a backdrop click but not on a click inside the panel', async () => {
		render(KeyboardShortcutsModal, { props: { open: true, onClose } });
		await fireEvent.click(screen.getByRole('document'));
		expect(onClose).not.toHaveBeenCalled();
		await fireEvent.click(screen.getByRole('dialog'));
		expect(onClose).toHaveBeenCalledTimes(1);
	});
});
