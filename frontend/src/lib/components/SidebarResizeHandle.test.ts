import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { sidebar, sidebarActions } from '#lib/stores/sidebar.svelte.ts';
import SidebarResizeHandle from './SidebarResizeHandle.svelte';

describe('SidebarResizeHandle', () => {
	afterEach(() => {
		cleanup();
		sidebarActions.resetWidth();
		localStorage.removeItem('sidebarWidth');
	});

	it('resizes the sidebar and remembers the width', async () => {
		render(SidebarResizeHandle);
		const handle = screen.getByRole('separator', { name: 'Resize sidebar' });
		expect(handle).toHaveAttribute('aria-valuenow', '280');

		await fireEvent.keyDown(handle, { key: 'ArrowRight' });
		expect(sidebar.width).toBe(296);
		expect(handle).toHaveAttribute('aria-valuenow', '296');
		expect(localStorage.getItem('sidebarWidth')).toBe('296');

		await fireEvent.keyDown(handle, { key: 'End' });
		expect(sidebar.width).toBe(520);

		await fireEvent.dblClick(handle);
		expect(sidebar.width).toBe(280);
	});

	it('tells the layout while a drag is running', async () => {
		const ondragchange = vi.fn();
		render(SidebarResizeHandle, { props: { ondragchange } });
		const handle = screen.getByRole('separator', { name: 'Resize sidebar' });

		await fireEvent.pointerDown(handle, { clientX: 280, pointerId: 1, button: 0 });
		expect(ondragchange).toHaveBeenLastCalledWith(true);
		await fireEvent.pointerMove(handle, { clientX: 380, pointerId: 1 });
		expect(sidebar.width).toBe(380);
		await fireEvent.pointerUp(handle, { clientX: 380, pointerId: 1 });
		expect(ondragchange).toHaveBeenLastCalledWith(false);
	});
});
