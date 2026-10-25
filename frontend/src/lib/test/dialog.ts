import { screen, waitFor } from '@testing-library/svelte';

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
