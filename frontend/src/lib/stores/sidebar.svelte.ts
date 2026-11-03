/** Storage can be blocked (private windows, site settings); the sidebar then just doesn't remember. */
function readStorage(key: string): string | null {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

function writeStorage(key: string, value: string) {
	try {
		localStorage.setItem(key, value);
	} catch {
		// Not remembered; the current session still works.
	}
}

function getInitialSidebarState(): boolean {
	const stored = readStorage('sidebarOpen');
	if (stored !== null) {
		return stored === 'true';
	}

	return window.innerWidth >= 768;
}

/** The desktop sidebar's width range in pixels (the mobile drawer keeps its own). */
export const SIDEBAR_WIDTH = { min: 220, max: 520, default: 280 } as const;

function clampWidth(width: number): number {
	return Math.round(Math.min(SIDEBAR_WIDTH.max, Math.max(SIDEBAR_WIDTH.min, width)));
}

function getInitialWidth(): number {
	const stored = Number.parseFloat(readStorage('sidebarWidth') ?? '');
	return Number.isFinite(stored) ? clampWidth(stored) : SIDEBAR_WIDTH.default;
}

let widthState = $state<number>(getInitialWidth());

let sidebarState = $state<boolean>(getInitialSidebarState());

// Function to persist sidebar state
function persistSidebarState() {
	writeStorage('sidebarOpen', sidebarState.toString());
}

export const sidebar = {
	get isOpen() {
		return sidebarState;
	},
	/** The desktop sidebar's width in pixels. */
	get width() {
		return widthState;
	}
};

export const sidebarActions = {
	/** Sets the width (clamped to SIDEBAR_WIDTH) and remembers it in this browser. */
	setWidth: (width: number) => {
		widthState = clampWidth(width);
		writeStorage('sidebarWidth', String(widthState));
	},

	resetWidth: () => {
		sidebarActions.setWidth(SIDEBAR_WIDTH.default);
	},

	toggle: () => {
		sidebarState = !sidebarState;
		persistSidebarState();
	},

	open: () => {
		sidebarState = true;
		persistSidebarState();
	},

	close: () => {
		sidebarState = false;
		persistSidebarState();
	},

	closeOnMobile: () => {
		if (window.innerWidth < 768) {
			sidebarState = false;
			persistSidebarState();
		}
	}
};
