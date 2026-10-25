import { describe, it, expect, vi, afterEach } from 'vitest';
import { copyToClipboard, isClipboardSupported } from './clipboard';

describe('copyToClipboard', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('uses the async clipboard API when available', async () => {
		const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();

		await expect(copyToClipboard('hello')).resolves.toEqual({ success: true });
		expect(write).toHaveBeenCalledWith('hello');
	});

	it('falls back to execCommand when the clipboard API rejects', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
		let copied = '';
		const exec = vi.spyOn(document, 'execCommand').mockImplementation(() => {
			copied = (document.activeElement as HTMLTextAreaElement).value;
			return true;
		});

		await expect(copyToClipboard('fallback text')).resolves.toEqual({ success: true });
		expect(exec).toHaveBeenCalledWith('copy');
		expect(copied).toBe('fallback text');
		expect(document.querySelector('textarea')).toBeNull();
	});

	it('reports a failed or throwing copy command', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
		const exec = vi.spyOn(document, 'execCommand').mockReturnValueOnce(false);

		await expect(copyToClipboard('x')).resolves.toEqual({
			success: false,
			error: 'Copy command failed'
		});

		exec.mockImplementationOnce(() => {
			throw new Error('blocked');
		});
		await expect(copyToClipboard('x')).resolves.toEqual({ success: false, error: 'blocked' });
	});

	it('reports support in a secure context', () => {
		expect(isClipboardSupported()).toBe(true);
	});
});
