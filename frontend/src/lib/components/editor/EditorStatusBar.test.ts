import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '$lib/test/component-utils.js';
import EditorStatusBar from './EditorStatusBar.svelte';

describe('EditorStatusBar', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
	});

	it('renders status bar', () => {
		const { container } = render(EditorStatusBar);
		const statusBar = container.querySelector('div');
		expect(statusBar).toBeInTheDocument();
	});

	it('calculates word count correctly', () => {
		const { container } = render(EditorStatusBar, {
			props: { content: 'Hello world this is a test' }
		});

		const wordCountElement = container.querySelector('span');
		expect(wordCountElement).toHaveTextContent('Words: 6');
	});

	it('shows auto-save indicator when enabled', () => {
		const { container } = render(EditorStatusBar, {
			props: { autoSaveEnabled: true }
		});

		const autoSaveSpan = Array.from(container.querySelectorAll('span')).find((span) =>
			span.textContent?.includes('Auto-save')
		);
		expect(autoSaveSpan).toHaveTextContent('Auto-save enabled');
	});

	it('handles all props together', () => {
		const content = 'This is test content';
		const { container } = render(EditorStatusBar, {
			props: {
				content,
				theme: 'dark',
				autoSaveEnabled: true,
				isFullscreen: true
			}
		});

		const wordCountElement = container.querySelector('span');
		expect(wordCountElement).toHaveTextContent('Words: 4');

		const autoSaveSpan = Array.from(container.querySelectorAll('span')).find((span) =>
			span.textContent?.includes('Auto-save')
		);
		expect(autoSaveSpan).toBeInTheDocument();

		const themeSpan = Array.from(container.querySelectorAll('span')).find((span) =>
			span.textContent?.includes('Theme:')
		);
		expect(themeSpan).toHaveTextContent('Theme: dark');
	});
});
