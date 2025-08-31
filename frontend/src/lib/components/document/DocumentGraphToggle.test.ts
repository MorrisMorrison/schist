import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, user } from '$lib/test/component-utils.js';
import DocumentGraphToggle from './DocumentGraphToggle.svelte';

// Mock Lucide icons
vi.mock('@lucide/svelte', () => {
	return {
		List: () => ({ $$: { fragment: null } }),
		Network: () => ({ $$: { fragment: null } })
	};
});

describe('DocumentGraphToggle', () => {
	const defaultProps = {
		currentView: 'list' as const,
		onToggle: vi.fn()
	};

	beforeEach(() => {
		document.body.innerHTML = '';
		vi.clearAllMocks();
	});

	it('renders both graph and list buttons', () => {
		const { container } = render(DocumentGraphToggle, {
			props: defaultProps
		});

		const buttons = container.querySelectorAll('button');
		expect(buttons).toHaveLength(2);
		expect(buttons[0]).toHaveTextContent('Graph');
		expect(buttons[1]).toHaveTextContent('List');
	});

	it('calls onToggle with "graph" when graph button is clicked', async () => {
		const onToggle = vi.fn();
		const { container } = render(DocumentGraphToggle, {
			props: {
				...defaultProps,
				onToggle
			}
		});

		const buttons = container.querySelectorAll('button');
		await user.click(buttons[0]);

		expect(onToggle).toHaveBeenCalledWith('graph');
	});

	it('calls onToggle with "list" when list button is clicked', async () => {
		const onToggle = vi.fn();
		const { container } = render(DocumentGraphToggle, {
			props: {
				...defaultProps,
				onToggle
			}
		});

		const buttons = container.querySelectorAll('button');
		await user.click(buttons[1]);

		expect(onToggle).toHaveBeenCalledWith('list');
	});

	it('does not call onToggle when disabled', async () => {
		const onToggle = vi.fn();
		const { container } = render(DocumentGraphToggle, {
			props: {
				...defaultProps,
				onToggle,
				disabled: true
			}
		});

		const buttons = container.querySelectorAll('button');
		await user.click(buttons[0]);
		await user.click(buttons[1]);

		expect(onToggle).not.toHaveBeenCalled();
	});
});
