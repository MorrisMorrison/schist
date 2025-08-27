import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, user } from '$lib/test/component-utils.js';
import EditorControls from './EditorControls.svelte';

describe('EditorControls', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
		vi.clearAllMocks();
	});

	it('renders controls', () => {
		const { container } = render(EditorControls, {
			props: { onTogglePreview: vi.fn() }
		});

		const controlsDiv = container.querySelector('div');
		expect(controlsDiv).toBeInTheDocument();
	});

	it('toggles preview button functionality', async () => {
		const onTogglePreview = vi.fn();
		const { container } = render(EditorControls, {
			props: {
				isPreviewVisible: true,
				onTogglePreview
			}
		});

		const toggleButton = container.querySelector('button') as HTMLElement;
		expect(toggleButton).toHaveTextContent('Hide Preview');

		await user.click(toggleButton);
		expect(onTogglePreview).toHaveBeenCalledTimes(1);
	});

	it('shows unsaved changes indicator', () => {
		const { container } = render(EditorControls, {
			props: {
				isDirty: true,
				onTogglePreview: vi.fn()
			}
		});

		const unsavedIndicator = container.querySelector('[data-testid="unsaved-indicator"]');
		expect(unsavedIndicator).toBeInTheDocument();
		expect(unsavedIndicator).toHaveTextContent('Unsaved changes');
	});

	it('displays correct title based on fullscreen state', () => {
		const { container } = render(EditorControls, {
			props: {
				isFullscreen: true,
				onTogglePreview: vi.fn()
			}
		});

		const titleSpan = container.querySelector('.text-sm.font-medium');
		expect(titleSpan).toHaveTextContent('Fullscreen Editor');
	});
});
