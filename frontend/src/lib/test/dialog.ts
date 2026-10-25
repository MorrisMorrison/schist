import { screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';

/**
 * Presses the pointer on an open ui/dialog's overlay, below the panel. bits-ui
 * checks the press coordinates against the panel and reacts after a short
 * debounce, so wait for the outcome.
 */
export async function pressOutsideDialog() {
	const panel = screen.getByRole('dialog').getBoundingClientRect();
	await userEvent.pointer({
		keys: '[MouseLeft]',
		target: document.querySelector<HTMLElement>('[data-slot="dialog-overlay"]')!,
		coords: { clientX: 5, clientY: Math.max(panel.bottom + 1, window.innerHeight - 5) }
	});
}

/**
 * Waits until an open bits-ui dialog has moved focus into itself. The dialog
 * focuses its first focusable element asynchronously after opening; typing
 * before that can race with the focus move and lose keystrokes.
 */
export async function waitForDialogFocus() {
	await waitFor(() => {
		const dialog = screen.getByRole('dialog');
		if (!dialog.contains(document.activeElement)) throw new Error('dialog not focused yet');
	});
}

/**
 * Selects files on a file input. `userEvent.upload` cannot assign
 * `input.files` in real Chromium, so build a FileList via DataTransfer.
 */
export function selectFiles(input: HTMLInputElement, files: File[]) {
	const transfer = new DataTransfer();
	for (const file of files) transfer.items.add(file);
	input.files = transfer.files;
	input.dispatchEvent(new Event('change', { bubbles: true }));
}
