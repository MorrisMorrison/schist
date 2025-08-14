export interface LoadingConfig {
	delayMs?: number;
	minDisplayMs?: number;
}

export class LoadingStateOptimizer {
	private delayTimeout: number | null = null;
	private minDisplayTimeout: number | null = null;
	private showingLoading = false;
	private shouldShow = false;
	private startTime: number | null = null;

	constructor(
		private updateState: (loading: boolean) => void,
		private config: LoadingConfig = {}
	) {
		this.config.delayMs = config.delayMs ?? 200;
		this.config.minDisplayMs = config.minDisplayMs ?? 150;
	}

	start() {
		this.shouldShow = true;
		this.cleanup();

		this.delayTimeout = window.setTimeout(() => {
			if (this.shouldShow && !this.showingLoading) {
				this.showingLoading = true;
				this.startTime = Date.now();
				this.updateState(true);
			}
		}, this.config.delayMs);
	}

	stop() {
		this.shouldShow = false;

		if (!this.showingLoading) {
			this.cleanup();
			return;
		}

		const elapsed = this.startTime ? Date.now() - this.startTime : 0;
		const remainingTime = Math.max(0, this.config.minDisplayMs! - elapsed);

		if (remainingTime > 0) {
			this.minDisplayTimeout = window.setTimeout(() => {
				this.showingLoading = false;
				this.updateState(false);
				this.cleanup();
			}, remainingTime);
		} else {
			this.showingLoading = false;
			this.updateState(false);
			this.cleanup();
		}
	}

	private cleanup() {
		if (this.delayTimeout) {
			clearTimeout(this.delayTimeout);
			this.delayTimeout = null;
		}
		if (this.minDisplayTimeout) {
			clearTimeout(this.minDisplayTimeout);
			this.minDisplayTimeout = null;
		}
	}

	destroy() {
		this.cleanup();
		this.showingLoading = false;
		this.shouldShow = false;
	}
}
