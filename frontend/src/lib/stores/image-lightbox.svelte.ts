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

function createImageLightboxStore() {
	const lightboxState = $state<LightboxState>(defaultLightboxState);

	return {
		get open() {
			return lightboxState.open;
		},
		get src() {
			return lightboxState.src;
		},
		get alt() {
			return lightboxState.alt;
		},
		openImage: (src: string, alt: string = '') => {
			lightboxState.open = true;
			lightboxState.src = src;
			lightboxState.alt = alt;
		},
		close: () => {
			lightboxState.open = false;
		}
	};
}

export const imageLightbox = createImageLightboxStore();

// Backward compatibility
export const imageLightboxActions = {
	open: imageLightbox.openImage,
	close: imageLightbox.close
};

declare global {
	interface Window {
		openImageLightbox: (src: string, alt: string) => void;
	}
}

window.openImageLightbox = imageLightboxActions.open;
