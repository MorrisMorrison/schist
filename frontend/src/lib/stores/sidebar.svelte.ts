function getInitialSidebarState(): boolean {
	const stored = localStorage.getItem('sidebarOpen');
	if (stored !== null) {
		return stored === 'true';
	}

	return window.innerWidth >= 768;
}

let sidebarState = $state<boolean>(getInitialSidebarState());

// Function to persist sidebar state
function persistSidebarState() {
	if (typeof localStorage !== 'undefined') {
		localStorage.setItem('sidebarOpen', sidebarState.toString());
	}
}

export const sidebar = {
	get isOpen() {
		return sidebarState;
	}
};

export const sidebarActions = {
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
