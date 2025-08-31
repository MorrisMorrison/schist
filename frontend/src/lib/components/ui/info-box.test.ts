import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '$lib/test/component-utils.js';
import InfoBox from './info-box.svelte';

describe('InfoBox', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
	});

	it('renders title and description', () => {
		const { container } = render(InfoBox, {
			props: {
				title: 'Important Information',
				description: 'This is some helpful information for the user.'
			}
		});

		expect(container).toHaveTextContent('Important Information');
		expect(container).toHaveTextContent('This is some helpful information for the user.');
	});

	it('displays info icon', () => {
		const { container } = render(InfoBox, {
			props: {
				title: 'Test Title',
				description: 'Test Description'
			}
		});

		const icon = container.querySelector('svg');
		expect(icon).toBeInTheDocument();
		expect(icon).toHaveClass('h-4', 'w-4', 'text-blue-600');
	});

	it('applies correct styling classes', () => {
		const { container } = render(InfoBox, {
			props: {
				title: 'Test Title',
				description: 'Test Description'
			}
		});

		const infoBox = container.querySelector('div');
		expect(infoBox).toHaveClass('rounded-lg', 'border', 'border-blue-200', 'bg-blue-50', 'p-3');
	});

	it('applies proper text styling to title', () => {
		const { container } = render(InfoBox, {
			props: {
				title: 'Styled Title',
				description: 'Test Description'
			}
		});

		const title = container.querySelector('p.font-medium');
		expect(title).toBeInTheDocument();
		expect(title).toHaveClass('text-sm', 'font-medium', 'text-blue-900');
		expect(title).toHaveTextContent('Styled Title');
	});

	it('applies proper text styling to description', () => {
		const { container } = render(InfoBox, {
			props: {
				title: 'Test Title',
				description: 'Styled Description'
			}
		});

		const description = container.querySelector('p.text-xs');
		expect(description).toBeInTheDocument();
		expect(description).toHaveClass('mt-1', 'text-xs', 'text-blue-700');
		expect(description).toHaveTextContent('Styled Description');
	});

	it('uses flexbox layout correctly', () => {
		const { container } = render(InfoBox, {
			props: {
				title: 'Layout Test',
				description: 'Testing flexbox layout'
			}
		});

		const flexContainer = container.querySelector('.flex');
		expect(flexContainer).toBeInTheDocument();
		expect(flexContainer).toHaveClass('flex');

		const icon = flexContainer?.querySelector('svg');
		expect(icon).toHaveClass('flex-shrink-0');
	});

	it('handles long text content', () => {
		const longTitle = 'This is a very long title that might wrap to multiple lines in the info box';
		const longDescription =
			'This is a very long description that contains a lot of information and might wrap to multiple lines depending on the container width and font size settings.';

		const { container } = render(InfoBox, {
			props: {
				title: longTitle,
				description: longDescription
			}
		});

		expect(container).toHaveTextContent(longTitle);
		expect(container).toHaveTextContent(longDescription);
	});
});
