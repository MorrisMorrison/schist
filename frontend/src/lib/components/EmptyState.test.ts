import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { FileText } from '@lucide/svelte';
import EmptyState from './EmptyState.svelte';

describe('EmptyState', () => {
	afterEach(() => cleanup());

	it('renders the title, description and icon with default padding', () => {
		const { container } = render(EmptyState, {
			props: { icon: FileText, title: 'No pages', description: 'Create one to start.' }
		});

		expect(screen.getByRole('heading', { name: 'No pages' })).toBeInTheDocument();
		expect(screen.getByText('Create one to start.')).toBeInTheDocument();
		expect(container.querySelector('svg')).not.toBeNull();
		expect(container.firstElementChild).toHaveClass('py-8');
	});

	it('renders the action snippet and custom padding', () => {
		const action = createRawSnippet(() => ({ render: () => '<button>New page</button>' }));
		const { container } = render(EmptyState, {
			props: {
				icon: FileText,
				title: 'Empty',
				description: 'Nothing here',
				action,
				padding: 'py-2'
			}
		});

		expect(screen.getByRole('button', { name: 'New page' })).toBeInTheDocument();
		expect(container.firstElementChild).toHaveClass('py-2');
	});
});
