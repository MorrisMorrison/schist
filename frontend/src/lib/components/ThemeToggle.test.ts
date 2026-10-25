import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { themeStore, type Theme } from '$lib/stores/theme.svelte';
import ThemeToggle from './ThemeToggle.svelte';

describe('ThemeToggle', () => {
	let initial: Theme;

	beforeEach(() => {
		initial = themeStore.current;
		themeStore.set('light');
	});

	afterEach(() => {
		cleanup();
		themeStore.set(initial);
	});

	it('toggles between light and dark', async () => {
		render(ThemeToggle);
		const button = screen.getByTestId('theme-toggle');
		expect(button).toHaveAttribute('title', 'Toggle theme (current: light)');

		await fireEvent.click(button);

		expect(themeStore.current).toBe('dark');
		expect(document.documentElement).toHaveClass('dark');
		expect(button).toHaveAttribute('title', 'Toggle theme (current: dark)');

		await fireEvent.click(button);
		expect(themeStore.current).toBe('light');
		expect(document.documentElement).not.toHaveClass('dark');
	});
});
