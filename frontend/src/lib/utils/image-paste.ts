import { EditorView } from '@codemirror/view';
import type { Asset } from '$lib/api/types';
import { apiClient } from '$lib/api/client';

export interface ImagePasteOptions {
	onUploadStart?: () => void;
	onUploadProgress?: (progress: number) => void;
	onUploadComplete?: (asset: Asset) => void;
	onUploadError?: (error: string) => void;
}

class ImagePasteHandler {
	private options: ImagePasteOptions;

	constructor(options: ImagePasteOptions = {}) {
		this.options = options;
	}

	private isImageFile(file: File): boolean {
		return (
			file.type.startsWith('image/') &&
			['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'].includes(
				file.type
			)
		);
	}

	private async verifyImageAccess(assetPath: string): Promise<void> {
		// Convert asset path to actual URL that will be used by the browser
		const imageUrl = apiClient.getAssetUrl(assetPath);

		return new Promise((resolve, reject) => {
			const img = new Image();
			// eslint-disable-next-line prefer-const
			let timeoutId: number;

			const cleanup = () => {
				clearTimeout(timeoutId);
				img.onload = null;
				img.onerror = null;
			};

			img.onload = () => {
				cleanup();
				resolve();
			};

			img.onerror = () => {
				cleanup();
				// If image fails to load, wait a bit and try again
				setTimeout(() => {
					const retryImg = new Image();
					retryImg.onload = () => resolve();
					retryImg.onerror = () => reject(new Error(`Image not accessible at ${imageUrl}`));
					retryImg.src = imageUrl + '?t=' + Date.now(); // Cache bust
				}, 200);
			};

			// Timeout after 3 seconds
			timeoutId = window.setTimeout(() => {
				cleanup();
				reject(new Error(`Image load timeout for ${imageUrl}`));
			}, 3000);

			img.src = imageUrl;
		});
	}

	private async handleImageUpload(file: File, view: EditorView): Promise<void> {
		try {
			this.options.onUploadStart?.();

			const asset = await apiClient.uploadImage(file, (progress) => {
				this.options.onUploadProgress?.(progress);
			});

			// Insert markdown image syntax at cursor position
			const cursor = view.state.selection.main.head;
			// Add timestamp to bust browser cache for newly uploaded images
			const cacheBustPath = `${asset.path}?t=${Date.now()}`;
			const imageMarkdown = `![${asset.original_name}](${cacheBustPath})`;

			const transaction = view.state.update({
				changes: { from: cursor, insert: imageMarkdown },
				selection: { anchor: cursor + imageMarkdown.length }
			});

			view.dispatch(transaction);
			this.options.onUploadComplete?.(asset);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Upload failed';
			this.options.onUploadError?.(errorMessage);
		}
	}

	handlePaste(event: ClipboardEvent, view: EditorView): boolean {
		const clipboardData = event.clipboardData;
		if (!clipboardData) return false;

		// Check for image files in clipboard
		const files = Array.from(clipboardData.files);
		const imageFiles = files.filter((file) => this.isImageFile(file));

		if (imageFiles.length === 0) {
			// No images, let default paste behavior handle it
			return false;
		}

		// Prevent default paste behavior for images
		event.preventDefault();

		// Handle each image file
		imageFiles.forEach((file) => {
			this.handleImageUpload(file, view);
		});

		return true;
	}

	handleDrop(event: DragEvent, view: EditorView): boolean {
		const dataTransfer = event.dataTransfer;
		if (!dataTransfer) return false;

		const files = Array.from(dataTransfer.files);
		const imageFiles = files.filter((file) => this.isImageFile(file));

		if (imageFiles.length === 0) {
			return false;
		}

		event.preventDefault();

		// Get drop position
		const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
		if (pos === null) return true;

		// Set cursor to drop position
		view.dispatch({
			selection: { anchor: pos }
		});

		// Handle each image file
		imageFiles.forEach((file) => {
			this.handleImageUpload(file, view);
		});

		return true;
	}
}

export function imagePasteExtension(options: ImagePasteOptions = {}) {
	const handler = new ImagePasteHandler(options);

	return EditorView.domEventHandlers({
		paste(event: ClipboardEvent, view: EditorView) {
			return handler.handlePaste(event, view);
		},
		drop(event: DragEvent, view: EditorView) {
			return handler.handleDrop(event, view);
		},
		dragover(event: DragEvent) {
			// Prevent default to allow drop
			const dataTransfer = event.dataTransfer;
			if (dataTransfer) {
				const hasImages = Array.from(dataTransfer.types).includes('Files');
				if (hasImages) {
					event.preventDefault();
					dataTransfer.dropEffect = 'copy';
				}
			}
			return false;
		}
	});
}
