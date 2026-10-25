import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import LoadingRow from './LoadingRow.svelte';

describe('LoadingRow', () => {
	afterEach(() => cleanup());

	it('shows a spinner next to the text', () => {
		const { container } = render(LoadingRow, { props: { text: 'Loading users...' } });

		expect(screen.getByText('Loading users...')).toBeInTheDocument();
		expect(container.querySelector('.animate-spin')).not.toBeNull();
	});
});
