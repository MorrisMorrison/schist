import { getErrorMessage } from '$lib/utils/error';

/**
 * Runs an async operation against a resource-style state object, managing the
 * shared `loading`/`error` bookkeeping that store actions repeat.
 *
 * Sets `loading = true` and clears `error` before running `fn`. On failure,
 * stores a friendly message via `getErrorMessage(e, fallback)` and rethrows.
 * Always resets `loading = false` when finished.
 */
export async function runAsync<T>(
	state: { loading: boolean; error: string | null },
	fn: () => Promise<T>,
	fallback: string
): Promise<T> {
	state.loading = true;
	state.error = null;

	try {
		return await fn();
	} catch (error) {
		state.error = getErrorMessage(error, fallback);
		throw error;
	} finally {
		state.loading = false;
	}
}
