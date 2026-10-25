import { describe, it, expect } from 'vitest';
import { imageLightbox, imageLightboxActions } from './image-lightbox.svelte';

describe('image lightbox store', () => {
	it('opens with an image and closes again', () => {
		expect(imageLightbox.open).toBe(false);

		imageLightboxActions.open('/uploads/a.png', 'A diagram');
		expect(imageLightbox.open).toBe(true);
		expect(imageLightbox.src).toBe('/uploads/a.png');
		expect(imageLightbox.alt).toBe('A diagram');

		imageLightboxActions.close();
		expect(imageLightbox.open).toBe(false);
	});

	it('is reachable from rendered markdown through window.openImageLightbox', () => {
		window.openImageLightbox('/uploads/b.png', '');

		expect(imageLightbox.open).toBe(true);
		expect(imageLightbox.src).toBe('/uploads/b.png');
		expect(imageLightbox.alt).toBe('');
		imageLightbox.close();
	});
});
