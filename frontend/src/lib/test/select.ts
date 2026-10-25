import { expect } from 'vitest';
import { screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';

/**
 * Waits until a ui/select's list has closed and bits-ui has put <body>'s pointer
 * events back to what they were before it opened (still off inside an open dialog).
 */
async function waitForSelectClosed(bodyPointerEvents: string) {
	await waitFor(() => {
		expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
		expect(document.body.style.pointerEvents).toBe(bodyPointerEvents);
	});
}

/** The option labels a ui/select offers: opens it, reads them and closes it again. */
export async function selectOptionLabels(trigger: HTMLElement): Promise<string[]> {
	const bodyPointerEvents = document.body.style.pointerEvents;
	await userEvent.click(trigger);
	const options = await screen.findAllByRole('option');
	const labels = options.map((option) => option.textContent?.trim() ?? '');
	await userEvent.keyboard('{Escape}');
	await waitForSelectClosed(bodyPointerEvents);
	return labels;
}

/** Picks an option of a ui/select by its label and waits until the list has closed. */
export async function chooseSelectOption(trigger: HTMLElement, label: string) {
	const bodyPointerEvents = document.body.style.pointerEvents;
	await userEvent.click(trigger);
	await userEvent.click(await screen.findByRole('option', { name: label }));
	await waitForSelectClosed(bodyPointerEvents);
}
