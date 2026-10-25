import { describe, it, expect, vi, afterEach } from 'vitest';

// The open state is read once at import, so each scenario loads a fresh module copy.
let copy = 0;
async function loadSidebar() {
	const url = `./sidebar.svelte.ts?copy=${++copy}`;
	return (await import(/* @vite-ignore */ url)) as typeof import('./sidebar.svelte');
}

function setWidth(width: number) {
	vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(width);
}

describe('sidebar store', () => {
	afterEach(() => {
		localStorage.removeItem('sidebarOpen');
		vi.restoreAllMocks();
	});

	it('restores the stored state', async () => {
		setWidth(1200);
		localStorage.setItem('sidebarOpen', 'false');

		expect((await loadSidebar()).sidebar.isOpen).toBe(false);
	});

	it('defaults to open on desktop and closed on mobile', async () => {
		setWidth(1024);
		expect((await loadSidebar()).sidebar.isOpen).toBe(true);

		setWidth(500);
		expect((await loadSidebar()).sidebar.isOpen).toBe(false);
	});

	it('toggles, opens and closes, persisting each change', async () => {
		setWidth(1024);
		const { sidebar, sidebarActions } = await loadSidebar();

		sidebarActions.toggle();
		expect(sidebar.isOpen).toBe(false);
		expect(localStorage.getItem('sidebarOpen')).toBe('false');

		sidebarActions.open();
		expect(sidebar.isOpen).toBe(true);
		expect(localStorage.getItem('sidebarOpen')).toBe('true');

		sidebarActions.close();
		expect(sidebar.isOpen).toBe(false);
	});

	it('closes on mobile only', async () => {
		setWidth(1024);
		const { sidebar, sidebarActions } = await loadSidebar();

		sidebarActions.closeOnMobile();
		expect(sidebar.isOpen).toBe(true);

		setWidth(400);
		sidebarActions.closeOnMobile();
		expect(sidebar.isOpen).toBe(false);
		expect(localStorage.getItem('sidebarOpen')).toBe('false');
	});
});
