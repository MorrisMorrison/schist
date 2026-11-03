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

describe('sidebar width', () => {
	afterEach(() => {
		localStorage.removeItem('sidebarWidth');
		vi.restoreAllMocks();
	});

	it('starts at the default and remembers a resize, clamped to the range', async () => {
		const { sidebar, sidebarActions, SIDEBAR_WIDTH } = await loadSidebar();
		expect(SIDEBAR_WIDTH).toEqual({ min: 220, max: 520, default: 280 });
		expect(sidebar.width).toBe(280);

		sidebarActions.setWidth(360.4);
		expect(sidebar.width).toBe(360);
		expect(localStorage.getItem('sidebarWidth')).toBe('360');

		sidebarActions.setWidth(9999);
		expect(sidebar.width).toBe(520);
		sidebarActions.setWidth(10);
		expect(sidebar.width).toBe(220);

		sidebarActions.resetWidth();
		expect(sidebar.width).toBe(280);
		expect(localStorage.getItem('sidebarWidth')).toBe('280');
	});

	it('restores a stored width, ignoring junk and out-of-range values', async () => {
		localStorage.setItem('sidebarWidth', '400');
		expect((await loadSidebar()).sidebar.width).toBe(400);

		localStorage.setItem('sidebarWidth', 'wide');
		expect((await loadSidebar()).sidebar.width).toBe(280);

		localStorage.setItem('sidebarWidth', '5000');
		expect((await loadSidebar()).sidebar.width).toBe(520);
	});

	it('works when storage is unavailable', async () => {
		vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
			throw new Error('blocked');
		});
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new Error('blocked');
		});
		const { sidebar, sidebarActions } = await loadSidebar();
		expect(sidebar.width).toBe(280);
		sidebarActions.setWidth(300);
		expect(sidebar.width).toBe(300);
	});
});
