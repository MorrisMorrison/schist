import { writable } from 'svelte/store';

interface LightboxState {
	open: boolean;
	src: string;
	alt: string;
}

const initialState: LightboxState = {
	open: false,
	src: '',
	alt: ''
};

export const imageLightbox = writable(initialState);

export const imageLightboxActions = {
	open: (src: string, alt: string = '') => {
		imageLightbox.set({ open: true, src, alt });
	},
	close: () => {
		imageLightbox.update((state) => ({ ...state, open: false }));
	}
};

// Global function for markdown onclick
declare global {
	interface Window {
		openImageLightbox: (src: string, alt: string) => void;
	}
}

if (typeof window !== 'undefined') {
	window.openImageLightbox = imageLightboxActions.open;
}
