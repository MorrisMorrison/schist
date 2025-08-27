import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '$lib/test/component-utils.js';
import UploadStatus from './UploadStatus.svelte';

describe('UploadStatus', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
	});

	it('is hidden when no activity', () => {
		const { container } = render(UploadStatus, {
			props: {
				isUploading: false,
				uploadProgress: 0,
				uploadMessage: null,
				uploadError: null
			}
		});

		const statusDiv = container.querySelector('div');
		expect(statusDiv).not.toBeInTheDocument();
	});

	it('shows progress during upload', () => {
		const { container } = render(UploadStatus, {
			props: {
				isUploading: true,
				uploadProgress: 75,
				uploadMessage: 'Uploading...',
				uploadError: null
			}
		});

		const statusDiv = container.querySelector('div');
		expect(statusDiv).toBeInTheDocument();

		const progressBar = container.querySelector('.bg-blue-500');
		expect(progressBar).toHaveAttribute('style', 'width: 75%;');

		const messageSpan = container.querySelector('.text-foreground.text-sm');
		expect(messageSpan).toHaveTextContent('Uploading...');
	});

	it('shows error state', () => {
		const { container } = render(UploadStatus, {
			props: {
				isUploading: false,
				uploadProgress: 0,
				uploadMessage: null,
				uploadError: 'Upload failed!'
			}
		});

		const statusDiv = container.querySelector('div');
		expect(statusDiv).toBeInTheDocument();

		const errorDiv = container.querySelector('.text-red-600.dark\\:text-red-400');
		expect(errorDiv).toHaveTextContent('✗ Upload failed!');
	});

	it('shows success message', () => {
		const { container } = render(UploadStatus, {
			props: {
				isUploading: false,
				uploadProgress: 100,
				uploadMessage: 'Upload complete',
				uploadError: null
			}
		});

		const successDiv = container.querySelector('.text-green-600.dark\\:text-green-400');
		expect(successDiv).toHaveTextContent('✓ Upload complete');
	});
});
