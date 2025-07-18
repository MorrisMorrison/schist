<script lang="ts">
	import { folderActions } from '$lib/stores/pages';
	import { isValidPath, normalizePath } from '$lib/api/types';
	import { Button } from '$lib/components/ui/button';
	import { Folder, AlertCircle } from 'lucide-svelte';

	interface Props {
		parentPath?: string;
		onClose: () => void;
		onCreated: () => void;
	}

	let { parentPath = '', onClose, onCreated }: Props = $props();

	let folderName = $state('');
	let error = $state('');
	let isLoading = $state(false);

	const folderPath = $derived(parentPath ? `${parentPath}/${folderName}` : `/${folderName}`);
	const isValidName = $derived(validateFolderName(folderName));

	function validateFolderName(name: string): boolean {
		if (!name.trim()) return false;

		// Check for invalid characters
		if (!/^[a-zA-Z0-9\-_\s]+$/.test(name)) {
			// error = 'Folder name can only contain letters, numbers, hyphens, underscores, and spaces';
			return false;
		}

		// Check length
		if (name.length > 50) {
			// error = 'Folder name must be 50 characters or less';
			return false;
		}

		// Check for reserved names
		const reserved = ['api', 'admin', 'pages', 'folders', 'auth', 'docs'];
		if (reserved.includes(name.toLowerCase())) {
			// error = 'This folder name is reserved';
			return false;
		}

		// error = '';
		return true;
	}

	async function createFolder() {
		if (!isValidName || isLoading) return;

		isLoading = true;
		error = '';

		try {
			// Normalize the folder name (convert to URL-friendly format)
			const normalizedName = folderName.trim().toLowerCase().replace(/\s+/g, '-');
			const fullPath = parentPath ? `${parentPath}/${normalizedName}` : `/${normalizedName}`;

			await folderActions.createFolder(fullPath);
			onCreated();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to create folder';
		} finally {
			isLoading = false;
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			onClose();
		} else if (event.key === 'Enter' && isValidName && !isLoading) {
			createFolder();
		}
	}
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="modal-overlay" onclick={onClose}>
	<div class="modal" onclick={(e) => e.stopPropagation()}>
		<div class="modal-header">
			<div class="modal-title">
				<Folder class="modal-icon" />
				<h3>Create New Folder</h3>
			</div>
			<button type="button" class="modal-close" onclick={onClose} aria-label="Close modal">
				×
			</button>
		</div>

		<form
			onsubmit={(e) => {
				e.preventDefault();
				createFolder();
			}}
		>
			<div class="modal-body">
				<div class="form-group">
					<label for="folder-name">Folder Name</label>
					<input
						id="folder-name"
						type="text"
						bind:value={folderName}
						placeholder="Enter folder name"
						class:error={error && folderName}
						required
					/>

					{#if error && folderName}
						<div class="error-message">
							<AlertCircle class="error-icon" />
							{error}
						</div>
					{/if}
				</div>

				<div class="path-preview">
					<label>Full Path:</label>
					<code class="path-display">{folderPath}</code>
				</div>

				{#if parentPath}
					<div class="parent-info">
						<span class="label">Parent folder:</span>
						<code>{parentPath}</code>
					</div>
				{/if}
			</div>

			<div class="modal-footer">
				<Button type="button" variant="outline" onclick={onClose} disabled={isLoading}>
					Cancel
				</Button>
				<Button type="submit" disabled={!isValidName || isLoading}>
					{#if isLoading}
						Creating...
					{:else}
						Create Folder
					{/if}
				</Button>
			</div>
		</form>
	</div>
</div>

<style>
	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		backdrop-filter: blur(2px);
	}

	.modal {
		background: var(--color-background);
		border: 1px solid var(--color-border);
		border-radius: 0.75rem;
		max-width: 500px;
		width: 90%;
		max-height: 90vh;
		overflow-y: auto;
		box-shadow:
			0 20px 25px -5px rgba(0, 0, 0, 0.1),
			0 10px 10px -5px rgba(0, 0, 0, 0.04);
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1.5rem;
		border-bottom: 1px solid var(--color-border);
		background: var(--color-background-secondary);
		border-radius: 0.75rem 0.75rem 0 0;
	}

	.modal-title {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.modal-title h3 {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--color-text);
	}

	.modal-icon {
		width: 1.25rem;
		height: 1.25rem;
		color: var(--color-primary);
	}

	.modal-close {
		background: none;
		border: none;
		font-size: 1.5rem;
		cursor: pointer;
		color: var(--color-text-secondary);
		padding: 0.25rem;
		border-radius: 0.25rem;
		transition: all 0.2s ease;
	}

	.modal-close:hover {
		background: var(--color-background-tertiary);
		color: var(--color-text);
	}

	.modal-body {
		padding: 1.5rem;
	}

	.form-group {
		margin-bottom: 1.5rem;
	}

	.form-group label {
		display: block;
		margin-bottom: 0.5rem;
		font-weight: 500;
		color: var(--color-text);
	}

	.form-group input {
		width: 100%;
		padding: 0.75rem;
		border: 1px solid var(--color-border);
		border-radius: 0.5rem;
		font-size: 1rem;
		background: var(--color-background);
		color: var(--color-text);
		transition: all 0.2s ease;
	}

	.form-group input:focus {
		outline: none;
		border-color: var(--color-primary);
		box-shadow: 0 0 0 3px rgba(var(--color-primary-rgb), 0.1);
	}

	.form-group input.error {
		border-color: var(--color-error);
	}

	.error-message {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.5rem;
		padding: 0.5rem;
		background: rgba(var(--color-error-rgb), 0.1);
		border: 1px solid rgba(var(--color-error-rgb), 0.2);
		border-radius: 0.375rem;
		font-size: 0.875rem;
		color: var(--color-error);
	}

	.error-icon {
		width: 1rem;
		height: 1rem;
		flex-shrink: 0;
	}

	.path-preview {
		margin-bottom: 1rem;
		padding: 1rem;
		background: var(--color-background-secondary);
		border-radius: 0.5rem;
		border: 1px solid var(--color-border);
	}

	.path-preview label {
		display: block;
		margin-bottom: 0.5rem;
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--color-text-secondary);
	}

	.path-display {
		font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
		font-size: 0.875rem;
		color: var(--color-primary);
		background: var(--color-background);
		padding: 0.5rem;
		border-radius: 0.25rem;
		display: block;
		width: 100%;
		border: 1px solid var(--color-border);
	}

	.parent-info {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
		color: var(--color-text-secondary);
	}

	.parent-info .label {
		font-weight: 500;
	}

	.parent-info code {
		font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
		background: var(--color-background-secondary);
		padding: 0.25rem 0.5rem;
		border-radius: 0.25rem;
		color: var(--color-text);
	}

	.modal-footer {
		display: flex;
		gap: 0.75rem;
		justify-content: flex-end;
		padding: 1.5rem;
		border-top: 1px solid var(--color-border);
		background: var(--color-background-secondary);
		border-radius: 0 0 0.75rem 0.75rem;
	}

	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		border-radius: 0.375rem;
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
		text-decoration: none;
		border: none;
		outline: none;
	}

	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	@media (max-width: 768px) {
		.modal {
			width: 95%;
			margin: 1rem;
		}

		.modal-header,
		.modal-body,
		.modal-footer {
			padding: 1rem;
		}
	}
</style>
