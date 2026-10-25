import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { BookOpen, Pencil } from '@lucide/svelte';
import ModeToggle from './ModeToggle.svelte';

const options = [
	{ mode: 'read' as const, label: 'Read', title: 'Read (Ctrl+E)', icon: BookOpen, testId: 'r' },
	{ mode: 'edit' as const, label: 'Edit', title: 'Edit (Ctrl+E)', icon: Pencil, testId: 'e' }
];

describe('ModeToggle', () => {
	afterEach(() => cleanup());

	it('marks the current mode as pressed', () => {
		render(ModeToggle, { props: { mode: 'edit', options, onSelect: vi.fn() } });

		expect(screen.getByRole('group', { name: 'View mode' })).toBeInTheDocument();
		expect(screen.getByTestId('r')).toHaveAttribute('aria-pressed', 'false');
		expect(screen.getByTestId('e')).toHaveAttribute('aria-pressed', 'true');
		expect(screen.getByTestId('e')).toHaveAttribute('title', 'Edit (Ctrl+E)');
	});

	it('reports the chosen mode', async () => {
		const onSelect = vi.fn();
		render(ModeToggle, { props: { mode: 'read', options, onSelect } });

		await fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

		expect(onSelect).toHaveBeenCalledWith('edit');
	});
});
