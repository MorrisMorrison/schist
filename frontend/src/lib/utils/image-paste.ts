import { EditorView } from '@codemirror/view';
import type { Asset } from '$lib/api/types';
import { apiClient } from '$lib/api/client';
import { getErrorMessage } from './error';

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

	private async handleImageUpload(file: File, view: EditorView): Promise<void> {
		try {
			this.options.onUploadStart?.();

			const asset = await apiClient.uploadImage(file, (progress) => {
				this.options.onUploadProgress?.(progress);
			});

			const cursor = view.state.selection.main.head;
			const cacheBustPath = `${asset.path}?t=${Date.now()}`;
			const imageMarkdown = `![${asset.original_name}](${cacheBustPath} "${asset.original_name}|large")`;

			const transaction = view.state.update({
				changes: { from: cursor, insert: imageMarkdown },
				selection: { anchor: cursor + imageMarkdown.length }
			});

			view.dispatch(transaction);
			this.options.onUploadComplete?.(asset);
		} catch (error) {
			const errorMessage = getErrorMessage(error, 'Upload failed');
			this.options.onUploadError?.(errorMessage);
		}
	}

	handlePaste(event: ClipboardEvent, view: EditorView): boolean {
		const clipboardData = event.clipboardData;
		if (!clipboardData) return false;

		const files = Array.from(clipboardData.files);
		const imageFiles = files.filter((file) => this.isImageFile(file));

		if (imageFiles.length === 0) {
			return false;
		}

		event.preventDefault();

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

		const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
		if (pos === null) return true;

		view.dispatch({
			selection: { anchor: pos }
		});

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
