import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { ResizeHandle } from './index.ts';

function setup(props: Record<string, unknown> = {}) {
	const onResize = vi.fn();
	const onResizeStart = vi.fn();
	const onResizeEnd = vi.fn();
	render(ResizeHandle, {
		props: {
			value: 280,
			min: 220,
			max: 520,
			defaultValue: 280,
			label: 'Resize sidebar',
			onResize,
			onResizeStart,
			onResizeEnd,
			...props
		}
	});
	return {
		handle: screen.getByRole('separator', { name: 'Resize sidebar' }),
		onResize,
		onResizeStart,
		onResizeEnd
	};
}

describe('ResizeHandle', () => {
	afterEach(() => cleanup());

	it('is a focusable vertical separator that reports its value and range', () => {
		const { handle } = setup();
		expect(handle).toHaveAttribute('aria-orientation', 'vertical');
		expect(handle).toHaveAttribute('aria-valuenow', '280');
		expect(handle).toHaveAttribute('aria-valuemin', '220');
		expect(handle).toHaveAttribute('aria-valuemax', '520');
		expect(handle).toHaveAttribute('tabindex', '0');
	});

	it('resizes with the arrow keys, Home and End, clamped to the range', async () => {
		const { handle, onResize } = setup({ value: 500 });
		await fireEvent.keyDown(handle, { key: 'ArrowLeft' });
		expect(onResize).toHaveBeenLastCalledWith(484);
		await fireEvent.keyDown(handle, { key: 'ArrowRight', shiftKey: true });
		expect(onResize).toHaveBeenLastCalledWith(520);
		await fireEvent.keyDown(handle, { key: 'Home' });
		expect(onResize).toHaveBeenLastCalledWith(220);
		await fireEvent.keyDown(handle, { key: 'End' });
		expect(onResize).toHaveBeenLastCalledWith(520);
	});

	it('resets to the default on double-click and on Enter', async () => {
		const { handle, onResize } = setup({ value: 400 });
		await fireEvent.dblClick(handle);
		expect(onResize).toHaveBeenLastCalledWith(280);
		onResize.mockClear();
		await fireEvent.keyDown(handle, { key: 'Enter' });
		expect(onResize).toHaveBeenLastCalledWith(280);
	});

	it('follows a pointer drag from where it started, clamped', async () => {
		const { handle, onResize, onResizeStart, onResizeEnd } = setup();
		await fireEvent.pointerDown(handle, { clientX: 280, pointerId: 1, button: 0 });
		expect(onResizeStart).toHaveBeenCalledTimes(1);

		await fireEvent.pointerMove(handle, { clientX: 330, pointerId: 1 });
		expect(onResize).toHaveBeenLastCalledWith(330);
		await fireEvent.pointerMove(handle, { clientX: 1000, pointerId: 1 });
		expect(onResize).toHaveBeenLastCalledWith(520);
		await fireEvent.pointerMove(handle, { clientX: 0, pointerId: 1 });
		expect(onResize).toHaveBeenLastCalledWith(220);

		await fireEvent.pointerUp(handle, { clientX: 0, pointerId: 1 });
		expect(onResizeEnd).toHaveBeenCalledTimes(1);
		onResize.mockClear();
		await fireEvent.pointerMove(handle, { clientX: 400, pointerId: 1 });
		expect(onResize).not.toHaveBeenCalled();
	});

	it('ignores other mouse buttons', async () => {
		const { handle, onResizeStart } = setup();
		await fireEvent.pointerDown(handle, { clientX: 280, pointerId: 1, button: 2 });
		expect(onResizeStart).not.toHaveBeenCalled();
	});
});
