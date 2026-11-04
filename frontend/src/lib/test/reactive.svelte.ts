/**
 * Wraps a mock store's state in `$state`, so a test can change it and the
 * component under test updates as it would with the real store.
 */
export function reactive<T extends object>(value: T): T {
	const state = $state(value);
	return state;
}
