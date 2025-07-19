import { writable } from 'svelte/store';
import { browser } from '$app/environment';

// Get initial sidebar state based on screen size and stored preference
function getInitialSidebarState(): boolean {
	if (!browser) return true; // Default to open on server

	// Check for stored preference
	const stored = localStorage.getItem('sidebarOpen');
	if (stored !== null) {
		return stored === 'true';
	}

	// No stored preference, default based on screen size
	// Open on desktop (>= 768px), closed on mobile
	return window.innerWidth >= 768;
}

// Create the sidebar store
export const sidebarOpen = writable<boolean>(getInitialSidebarState());

// Update localStorage when sidebar state changes
sidebarOpen.subscribe((isOpen) => {
	if (browser) {
		localStorage.setItem('sidebarOpen', isOpen.toString());
	}
});

// Sidebar actions
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

	// Close sidebar on mobile when navigating
	closeOnMobile: () => {
		if (browser && window.innerWidth < 768) {
			sidebarOpen.set(false);
		}
	}
};
