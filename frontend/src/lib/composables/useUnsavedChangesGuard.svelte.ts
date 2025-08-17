import { beforeNavigate, goto } from '$app/navigation';
import type { Navigation } from '@sveltejs/kit';

interface UnsavedChangesGuardOptions {
	isDirty: () => boolean;
	onSave: () => Promise<void>;
	onShowModal: () => void;
	onHideModal: () => void;
}

export function useUnsavedChangesGuard(options: UnsavedChangesGuardOptions) {
	let pendingNavigation: Navigation | null = $state(null);
	let showModal = $state(false);
	let isSaving = $state(false);

	// Set up navigation interception
	beforeNavigate((navigation) => {
		// Only intercept if there are unsaved changes
		if (options.isDirty()) {
			navigation.cancel();
			pendingNavigation = navigation;
			showModal = true;
			options.onShowModal();
		}
	});

	// Set up browser beforeunload protection
	function handleBeforeUnload(event: BeforeUnloadEvent) {
		if (options.isDirty()) {
			// Prevent the default browser behavior
			event.preventDefault();
			// For compatibility with some browsers that still check return value
			return 'You have unsaved changes.';
		}
	}

	function setupBrowserProtection() {
		if (typeof window !== 'undefined') {
			window.addEventListener('beforeunload', handleBeforeUnload);
		}
	}

	function cleanupBrowserProtection() {
		if (typeof window !== 'undefined') {
			window.removeEventListener('beforeunload', handleBeforeUnload);
		}
	}

	async function handleSave() {
		if (!pendingNavigation) return;

		try {
			isSaving = true;
			await options.onSave();

			// After successful save, proceed with the navigation
			showModal = false;
			options.onHideModal();

			// Use goto to navigate to the target URL
			if (pendingNavigation.to?.url) {
				await goto(pendingNavigation.to.url);
			}
			pendingNavigation = null;
		} catch (error) {
			console.error('Failed to save before navigation:', error);
			// Keep modal open on save error
		} finally {
			isSaving = false;
		}
	}

	async function handleDiscard() {
		if (!pendingNavigation) return;

		// Proceed with navigation without saving
		showModal = false;
		options.onHideModal();

		// Use goto to navigate to the target URL
		if (pendingNavigation.to?.url) {
			await goto(pendingNavigation.to.url);
		}
		pendingNavigation = null;
	}

	function handleCancel() {
		// Cancel navigation and stay on current page
		showModal = false;
		options.onHideModal();
		pendingNavigation = null;
	}

	return {
		// State
		get showModal() {
			return showModal;
		},
		get isSaving() {
			return isSaving;
		},

		// Actions
		handleSave,
		handleDiscard,
		handleCancel,

		// Lifecycle
		setupBrowserProtection,
		cleanupBrowserProtection
	};
}
