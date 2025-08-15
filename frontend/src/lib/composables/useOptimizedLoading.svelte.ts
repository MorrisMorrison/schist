import { LoadingStateOptimizer } from '$lib/utils/loading-optimizer';

export function useOptimizedLoading(delayMs = 200, minDisplayMs = 150) {
	let loading = $state(false);
	let optimizer: LoadingStateOptimizer | null = null;

	function updateLoadingState(newLoading: boolean) {
		loading = newLoading;
	}

	function startLoading() {
		if (!optimizer) {
			optimizer = new LoadingStateOptimizer(updateLoadingState, { delayMs, minDisplayMs });
		}
		optimizer.start();
	}

	function stopLoading() {
		if (optimizer) {
			optimizer.stop();
		}
	}

	function cleanup() {
		if (optimizer) {
			optimizer.destroy();
			optimizer = null;
		}
	}

	return {
		get loading() {
			return loading;
		},
		startLoading,
		stopLoading,
		cleanup
	};
}
