import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';

// Reading the module's default export throws, so the lazy load fails.
vi.mock('$lib/components/editor/Editor.svelte', () => ({
	get default() {
		throw new Error('chunk failed to load');
	}
}));

import LazyEditor from './LazyEditor.svelte';

describe('LazyEditor when the editor chunk fails to load', () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	it('shows an error with a retry button', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});

		render(LazyEditor, { props: { initialContent: 'x' } });

		expect(
			await screen.findByText('Failed to load editor. Please refresh the page.')
		).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
		expect(console.error).toHaveBeenCalled();
	});
});
