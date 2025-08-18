import { browser } from '$app/environment';

interface LightboxState {
	open: boolean;
	src: string;
	alt: string;
}

const defaultLightboxState: LightboxState = {
	open: false,
	src: '',
	alt: ''
};

let lightboxState: LightboxState = defaultLightboxState;

if (browser) {
	lightboxState = $state<LightboxState>(defaultLightboxState);
}

function createImageLightboxActions() {
	return {
		open: (src: string, alt: string = '') => {
			if (browser) {
				lightboxState.open = true;
				lightboxState.src = src;
				lightboxState.alt = alt;
			}
		},
		close: () => {
			if (browser) {
				lightboxState.open = false;
			}
		}
	};
}

export const imageLightbox = {
	get open() {
		return lightboxState.open;
	},
	get src() {
		return lightboxState.src;
	},
	get alt() {
		return lightboxState.alt;
	}
};

export const imageLightboxActions = createImageLightboxActions();

declare global {
	interface Window {
		openImageLightbox: (src: string, alt: string) => void;
	}
}

if (browser) {
	window.openImageLightbox = imageLightboxActions.open;
}
