import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, user } from '$lib/test/component-utils';
import ImageBlock from './ImageBlock.svelte';
import type { ImageBlock as ImageBlockType } from '$lib/utils/markdown-blocks';

// Mock the image lightbox store
vi.mock('$lib/stores/image-lightbox.svelte', () => {
	return {
		imageLightboxActions: {
			open: () => {}
		}
	};
});

// Mock the sanitizer utility
vi.mock('$lib/utils/sanitizer', () => {
	return {
		sanitizeHtml: (text: string) => text
	};
});

// Mock the API client
vi.mock('$lib/api/client', () => {
	return {
		apiClient: {
			getAssetUrl: (url: string) => `http://localhost:3000${url}`
		}
	};
});

describe('ImageBlock', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
		vi.clearAllMocks();
	});

	const createMockImageBlock = (overrides: Partial<ImageBlockType> = {}): ImageBlockType => ({
		type: 'image',
		id: 'test-image-1',
		href: '/assets/image.jpg',
		title: 'Test Image Title',
		text: 'Test image alt text',
		size: undefined,
		raw: '![Test image alt text](/assets/image.jpg "Test Image Title")',
		...overrides
	});

	it('renders image with basic properties', () => {
		const block = createMockImageBlock();
		const { container } = render(ImageBlock, { props: { block } });

		const image = container.querySelector('img');
		expect(image).toBeInTheDocument();
		expect(image).toHaveAttribute('src', 'http://localhost:3000/assets/image.jpg');
		expect(image).toHaveAttribute('alt', 'Test image alt text');
		expect(image).toHaveAttribute('title', 'Test Image Title');
	});

	it('applies correct size classes', () => {
		const sizes: Array<{ size: string | undefined; expectedClass: string }> = [
			{ size: 'small', expectedClass: 'max-w-xs' },
			{ size: 'medium', expectedClass: 'max-w-md' },
			{ size: 'large', expectedClass: 'max-w-lg' },
			{ size: undefined, expectedClass: 'max-w-full' }
		];

		sizes.forEach(({ size, expectedClass }) => {
			document.body.innerHTML = '';
			const block = createMockImageBlock({ size });
			const { container } = render(ImageBlock, { props: { block } });

			const image = container.querySelector('img');
			expect(image).toHaveClass(expectedClass);
		});
	});

	it('image is clickable', async () => {
		const block = createMockImageBlock();
		const { container } = render(ImageBlock, { props: { block } });

		const image = container.querySelector('img') as HTMLElement;
		expect(image).toHaveClass('cursor-pointer');
	});

	it('displays caption when text differs from title', () => {
		const block = createMockImageBlock({
			title: 'Image Title',
			text: 'Different alt text'
		});
		const { container } = render(ImageBlock, { props: { block } });

		const caption = container.querySelector('p');
		expect(caption).toBeInTheDocument();
		expect(caption).toHaveTextContent('Different alt text');
	});
});
