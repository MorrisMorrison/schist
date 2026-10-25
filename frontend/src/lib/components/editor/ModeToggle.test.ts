import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { BookOpen, Pencil } from '@lucide/svelte';
import ModeToggle from './ModeToggle.svelte';

const options = [
	{ mode: 'read' as const, label: 'Read', title: 'Read (Ctrl+E)', icon: BookOpen, testId: 'r' },
	{ mode: 'edit' as const, label: 'Edit', title: 'Edit (Ctrl+E)', icon: Pencil, testId: 'e' }
];

describe('ModeToggle', () => {
	afterEach(() => cleanup());

	it('marks the current mode as checked', () => {
		render(ModeToggle, { props: { mode: 'edit', options, onSelect: vi.fn() } });

		const group = screen.getByRole('group', { name: 'View mode' });
		expect(group).toHaveAttribute('data-variant', 'segmented');
		expect(screen.getByTestId('r')).toHaveAttribute('aria-checked', 'false');
		expect(screen.getByTestId('e')).toHaveAttribute('aria-checked', 'true');
		expect(screen.getByTestId('e')).toHaveAttribute('title', 'Edit (Ctrl+E)');
	});

	it('reports the chosen mode', async () => {
		const onSelect = vi.fn();
		render(ModeToggle, { props: { mode: 'read', options, onSelect } });

		await fireEvent.click(screen.getByRole('radio', { name: 'Edit' }));

		expect(onSelect).toHaveBeenCalledWith('edit');
	});

	it('keeps the current mode when it is clicked again', async () => {
		const onSelect = vi.fn();
		render(ModeToggle, { props: { mode: 'read', options, onSelect } });

		await userEvent.click(screen.getByRole('radio', { name: 'Read' }));

		expect(onSelect).not.toHaveBeenCalled();
		expect(screen.getByTestId('r')).toHaveAttribute('aria-checked', 'true');
	});

	it('follows the mode it is given', async () => {
		const { rerender } = render(ModeToggle, {
			props: { mode: 'read', options, onSelect: vi.fn() }
		});

		await rerender({ mode: 'edit', options, onSelect: vi.fn() });

		expect(screen.getByTestId('e')).toHaveAttribute('aria-checked', 'true');
		expect(screen.getByTestId('r')).toHaveAttribute('aria-checked', 'false');
	});

	it('switches modes from the keyboard', async () => {
		const onSelect = vi.fn();
		render(ModeToggle, { props: { mode: 'read', options, onSelect } });

		screen.getByTestId('r').focus();
		await userEvent.keyboard('{ArrowRight}');
		await userEvent.keyboard('{Enter}');

		expect(onSelect).toHaveBeenCalledWith('edit');
	});
});
