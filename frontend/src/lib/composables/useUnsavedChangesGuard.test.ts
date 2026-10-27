import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { BeforeNavigate } from '$app/navigation';
import { beforeNavigate, goto } from '$app/navigation';
import { useUnsavedChangesGuard } from './useUnsavedChangesGuard.svelte';

type Guard = (navigation: BeforeNavigate) => void;

let guards: Guard[];
let completed: string[];

/** Simulates a SvelteKit navigation: every beforeNavigate callback runs, and any may cancel. */
function navigate(to: string) {
	let cancelled = false;
	const navigation = {
		to: { url: new URL(to, window.location.origin) },
		cancel: () => (cancelled = true)
	} as unknown as BeforeNavigate;
	for (const guard of guards) guard(navigation);
	if (!cancelled) completed.push(to);
	return navigation;
}

function setup(dirty = true) {
	const options = {
		isDirty: vi.fn(() => dirty),
		onSave: vi.fn(async () => {
			dirty = false;
		}),
		onShowModal: vi.fn(),
		onHideModal: vi.fn()
	};
	const guard = useUnsavedChangesGuard(options);
	return { guard, options, setDirty: (d: boolean) => (dirty = d) };
}

describe('useUnsavedChangesGuard', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		guards = [];
		completed = [];
		vi.mocked(beforeNavigate).mockImplementation((fn) => guards.push(fn as Guard));
		// goto() runs the beforeNavigate callbacks too, like SvelteKit does.
		vi.mocked(goto).mockImplementation(async (url) => {
			navigate(String(url));
		});
		vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('lets navigation through when there are no unsaved changes', () => {
		const { guard } = setup(false);

		navigate('/documents/a');

		expect(completed).toEqual(['/documents/a']);
		expect(guard.showModal).toBe(false);
	});

	it('cancels a dirty navigation and asks', () => {
		const { guard, options } = setup();

		navigate('/documents/a');

		expect(completed).toEqual([]);
		expect(guard.showModal).toBe(true);
		expect(options.onShowModal).toHaveBeenCalled();
	});

	it('saves, then continues to the original destination', async () => {
		const { guard, options } = setup();
		navigate('/documents/a');

		await guard.handleSave();

		expect(options.onSave).toHaveBeenCalled();
		expect(options.onHideModal).toHaveBeenCalled();
		expect(guard.showModal).toBe(false);
		expect(guard.isSaving).toBe(false);
		expect(completed).toEqual([new URL('/documents/a', window.location.origin).toString()]);
	});

	it('keeps the modal open when saving fails', async () => {
		const { guard, options } = setup();
		options.onSave.mockRejectedValueOnce(new Error('disk full'));
		navigate('/documents/a');

		await guard.handleSave();

		expect(guard.showModal).toBe(true);
		expect(guard.isSaving).toBe(false);
		expect(completed).toEqual([]);
	});

	it('discards the changes and continues to the original destination', async () => {
		const { guard, options } = setup();
		navigate('/documents/a');

		await guard.handleDiscard();

		expect(options.onSave).not.toHaveBeenCalled();
		expect(guard.showModal).toBe(false);
		expect(completed).toEqual([new URL('/documents/a', window.location.origin).toString()]);
	});

	it('still guards later navigations after a discard', async () => {
		const { guard } = setup();
		navigate('/documents/a');
		await guard.handleDiscard();

		navigate('/documents/b');

		expect(completed).toHaveLength(1);
		expect(guard.showModal).toBe(true);
	});

	it('cancel stays on the page', () => {
		const { guard, options } = setup();
		navigate('/documents/a');

		guard.handleCancel();

		expect(guard.showModal).toBe(false);
		expect(options.onHideModal).toHaveBeenCalled();
		expect(completed).toEqual([]);
	});

	it('does nothing on save or discard without a pending navigation', async () => {
		const { guard, options } = setup();

		await guard.handleSave();
		await guard.handleDiscard();

		expect(options.onSave).not.toHaveBeenCalled();
		expect(goto).not.toHaveBeenCalled();
	});

	it('warns before unloading the page only while dirty', () => {
		const { guard, setDirty } = setup();
		guard.setupBrowserProtection();

		const dirtyUnload = new Event('beforeunload', { cancelable: true });
		window.dispatchEvent(dirtyUnload);
		expect(dirtyUnload.defaultPrevented).toBe(true);

		setDirty(false);
		const cleanUnload = new Event('beforeunload', { cancelable: true });
		window.dispatchEvent(cleanUnload);
		expect(cleanUnload.defaultPrevented).toBe(false);

		setDirty(true);
		guard.cleanupBrowserProtection();
		const afterCleanup = new Event('beforeunload', { cancelable: true });
		window.dispatchEvent(afterCleanup);
		expect(afterCleanup.defaultPrevented).toBe(false);
	});
});
