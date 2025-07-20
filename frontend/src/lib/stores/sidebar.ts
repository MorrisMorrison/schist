import { writable } from 'svelte/store';
import { browser } from '$app/environment';

function getInitialSidebarState(): boolean {
	if (!browser) return true; // Default to open on server

	const stored = localStorage.getItem('sidebarOpen');
	if (stored !== null) {
		return stored === 'true';
	}

	// No stored preference, default based on screen size
	// Open on desktop (>= 768px), closed on mobile
	return window.innerWidth >= 768;
}

export const sidebarOpen = writable<boolean>(getInitialSidebarState());

sidebarOpen.subscribe((isOpen) => {
	if (browser) {
		localStorage.setItem('sidebarOpen', isOpen.toString());
	}
});

export const sidebarActions = {
	toggle: () => {
		sidebarOpen.update((isOpen) => !isOpen);
	},

	open: () => {
		sidebarOpen.set(true);
	},

	close: () => {
		sidebarOpen.set(false);
	},

	closeOnMobile: () => {
		if (browser && window.innerWidth < 768) {
			sidebarOpen.set(false);
		}
	}
};
