import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import ImageLightbox from './ImageLightbox.svelte';

// 1x1 transparent PNG, so the <img> fires load without a network request.
const PIXEL =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

function renderLightbox(props: Partial<{ src: string; alt: string; open: boolean }> = {}) {
	const onClose = vi.fn();
	const result = render(ImageLightbox, {
		props: { src: PIXEL, alt: 'Architecture diagram', open: true, onClose, ...props }
	});
	return { ...result, onClose };
}

function image() {
	return screen.getByRole<HTMLImageElement>('img', { name: 'Architecture diagram' });
}

async function loaded() {
	await vi.waitFor(() => expect(image()).not.toHaveClass('opacity-0'));
}

describe('ImageLightbox', () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	it('renders nothing while closed', () => {
		renderLightbox({ open: false });

		expect(screen.queryByRole('img')).not.toBeInTheDocument();
	});

	it('shows the image and its caption once it has loaded', async () => {
		renderLightbox();

		expect(image()).toHaveAttribute('src', PIXEL);
		await loaded();
		expect(screen.getByText('Architecture diagram', { selector: 'div' })).toBeInTheDocument();
	});

	it('zooms in and out with the buttons and reports the zoom level', async () => {
		renderLightbox();
		await loaded();

		await fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
		expect(image().style.transform).toBe('scale(1.25) rotate(0deg)');
		expect(screen.getByText(/Zoom: 125%/)).toBeInTheDocument();

		await fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
		expect(image().style.transform).toBe('scale(0.8) rotate(0deg)');
	});

	it('clamps the zoom and disables the buttons at the limits', async () => {
		renderLightbox();
		const zoomIn = screen.getByRole('button', { name: 'Zoom in' });
		const zoomOut = screen.getByRole('button', { name: 'Zoom out' });

		for (let i = 0; i < 8; i++) await fireEvent.click(zoomIn);
		expect(image().style.transform).toBe('scale(4) rotate(0deg)');
		expect(zoomIn).toBeDisabled();

		for (let i = 0; i < 14; i++) await fireEvent.click(zoomOut);
		expect(image().style.transform).toBe('scale(0.25) rotate(0deg)');
		expect(zoomOut).toBeDisabled();
	});

	it('rotates and resets', async () => {
		renderLightbox();
		await loaded();

		await fireEvent.click(screen.getByRole('button', { name: 'Rotate' }));
		expect(image().style.transform).toBe('scale(1) rotate(90deg)');
		expect(screen.getByText(/Rotated: 90°/)).toBeInTheDocument();

		await fireEvent.click(screen.getByRole('button', { name: 'Reset zoom and rotation' }));
		expect(image().style.transform).toBe('scale(1) rotate(0deg)');
	});

	it('supports keyboard shortcuts', async () => {
		renderLightbox();

		await fireEvent.keyDown(window, { key: '+' });
		await fireEvent.keyDown(window, { key: '=' });
		expect(image().style.transform).toBe('scale(1.5625) rotate(0deg)');

		await fireEvent.keyDown(window, { key: '-' });
		expect(image().style.transform).toBe('scale(1.25) rotate(0deg)');

		await fireEvent.keyDown(window, { key: 'r' });
		await fireEvent.keyDown(window, { key: 'R' });
		expect(image().style.transform).toBe('scale(1.25) rotate(180deg)');
	});

	it('closes with Escape and the close button', async () => {
		const { onClose } = renderLightbox();

		await fireEvent.keyDown(window, { key: 'Escape' });
		expect(onClose).toHaveBeenCalled();

		onClose.mockClear();
		await fireEvent.click(screen.getByRole('button', { name: 'Close image viewer' }));
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it('opens the image in a new tab', async () => {
		const open = vi.spyOn(window, 'open').mockReturnValue(null);
		renderLightbox();

		await fireEvent.click(screen.getByRole('button', { name: 'Open image in new tab' }));

		expect(open).toHaveBeenCalledWith(PIXEL, '_blank');
	});

	it('downloads the image under its alt text', async () => {
		const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
		renderLightbox();

		await fireEvent.click(screen.getByRole('button', { name: 'Download image' }));

		expect(click).toHaveBeenCalledTimes(1);
		const anchor = click.mock.contexts[0] as HTMLAnchorElement;
		expect(anchor.download).toBe('Architecture diagram');
		expect(anchor.href).toBe(PIXEL);
	});

	it('resets the transform when reopened', async () => {
		const { rerender } = renderLightbox();
		await fireEvent.click(screen.getByRole('button', { name: 'Rotate' }));

		await rerender({ open: false });
		await rerender({ open: true });

		expect(image().style.transform).toBe('scale(1) rotate(0deg)');
	});
});
