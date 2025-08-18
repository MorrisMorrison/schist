import { browser } from '$app/environment';

function getInitialSidebarState(): boolean {
	if (!browser) return true;

	const stored = localStorage.getItem('sidebarOpen');
	if (stored !== null) {
		return stored === 'true';
	}

	return window.innerWidth >= 768;
}

let sidebarState = $state<boolean>(getInitialSidebarState());

$effect(() => {
	if (browser) {
		localStorage.setItem('sidebarOpen', sidebarState.toString());
	}
});

export const sidebar = {
	get isOpen() {
		return sidebarState;
	}
};

export const sidebarActions = {
	toggle: () => {
		sidebarState = !sidebarState;
	},

	open: () => {
		sidebarState = true;
	},

	close: () => {
		sidebarState = false;
	},

	closeOnMobile: () => {
		if (browser && window.innerWidth < 768) {
			sidebarState = false;
		}
	}
};
