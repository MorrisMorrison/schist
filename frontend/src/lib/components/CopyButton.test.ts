import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import CopyButton from './CopyButton.svelte';

let writeText: ReturnType<typeof vi.fn>;

function stubClipboard(value: unknown) {
	Object.defineProperty(navigator, 'clipboard', { value, configurable: true });
}

describe('CopyButton', () => {
	beforeEach(() => {
		writeText = vi.fn().mockResolvedValue(undefined);
		stubClipboard({ writeText });
	});

	afterEach(() => {
		cleanup();
		vi.useRealTimers();
		vi.restoreAllMocks();
		// Drop the own-property stub so navigator.clipboard is the real one again.
		delete (navigator as unknown as Record<string, unknown>).clipboard;
	});

	it('copies the text and shows success, then resets to idle', async () => {
		vi.useFakeTimers();
		render(CopyButton, { props: { text: 'npm run build' } });
		const button = screen.getByRole('button', { name: 'Copy code to clipboard' });

		await fireEvent.click(button);
		await vi.waitFor(() =>
			expect(
				screen.getByRole('button', { name: 'Successfully copied to clipboard' })
			).toBeInTheDocument()
		);
		expect(writeText).toHaveBeenCalledWith('npm run build');

		await vi.advanceTimersByTimeAsync(2000);
		expect(screen.getByRole('button', { name: 'Copy code to clipboard' })).toBeInTheDocument();
	});

	it('copies on Enter', async () => {
		render(CopyButton, { props: { text: 'abc' } });

		await fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });

		await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith('abc'));
	});

	it('copies on Space', async () => {
		render(CopyButton, { props: { text: 'abc' } });

		await fireEvent.keyDown(screen.getByRole('button'), { key: ' ' });

		await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith('abc'));
	});

	it('ignores other keys', async () => {
		render(CopyButton, { props: { text: 'abc' } });

		await fireEvent.keyDown(screen.getByRole('button'), { key: 'a' });

		expect(writeText).not.toHaveBeenCalled();
	});

	it('falls back to execCommand and reports a failed copy', async () => {
		vi.useFakeTimers();
		writeText.mockRejectedValue(new Error('denied'));
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const execCommand = vi.spyOn(document, 'execCommand').mockReturnValue(false);
		render(CopyButton, { props: { text: 'secret' } });

		await fireEvent.click(screen.getByRole('button'));

		await vi.waitFor(() =>
			expect(
				screen.getByRole('button', { name: 'Copy failed: Copy command failed' })
			).toBeInTheDocument()
		);
		expect(execCommand).toHaveBeenCalledWith('copy');

		await vi.advanceTimersByTimeAsync(3000);
		expect(screen.getByRole('button', { name: 'Copy code to clipboard' })).toBeInTheDocument();
	});

	it('succeeds through the execCommand fallback', async () => {
		writeText.mockRejectedValue(new Error('denied'));
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.spyOn(document, 'execCommand').mockReturnValue(true);
		render(CopyButton, { props: { text: 'x' } });

		await fireEvent.click(screen.getByRole('button'));

		await vi.waitFor(() =>
			expect(
				screen.getByRole('button', { name: 'Successfully copied to clipboard' })
			).toBeInTheDocument()
		);
	});

	it('renders nothing when the clipboard is unsupported', () => {
		stubClipboard(undefined);
		vi.spyOn(document, 'queryCommandSupported').mockReturnValue(false);

		render(CopyButton, { props: { text: 'x' } });

		expect(screen.queryByRole('button')).not.toBeInTheDocument();
	});

	it('applies the passed class', () => {
		render(CopyButton, { props: { text: 'x', class: 'extra-class' } });

		expect(screen.getByRole('button')).toHaveClass('extra-class');
	});
});
