import { DirectoryManager, DirectoryState } from './directory-manager';

export interface TestValidationResult {
	passed: boolean;
	message: string;
	details?:
		| DirectoryState
		| {
				beforeState: DirectoryState;
				afterState: DirectoryState;
				actualPageDelta?: number;
				actualFolderDelta?: number;
				attempts?: number;
		  };
}

export interface StateChangeEvent {
	type: 'file_created' | 'file_deleted' | 'folder_created' | 'folder_deleted';
	timestamp: number;
	workerIndex: number;
	details: {
		path: string;
		name: string;
	};
}

export class TestMonitor {
	private directoryManager: DirectoryManager;
	private workerIndex: number;
	private stateHistory: DirectoryState[] = [];

	constructor(directoryManager: DirectoryManager, workerIndex: number) {
		this.directoryManager = directoryManager;
		this.workerIndex = workerIndex;
	}

	async recordState(context: string): Promise<DirectoryState> {
		const state = await this.directoryManager.getDirectoryState();
		state.timestamp = Date.now();
		this.stateHistory.push(state);

		console.log(`[Monitor ${this.workerIndex}] State recorded (${context}):`, {
			pages: state.pageCount,
			folders: state.folderCount,
			context
		});

		return state;
	}

	async validateFileCounts(
		expectedPages: number,
		expectedFolders: number
	): Promise<TestValidationResult> {
		const state = await this.directoryManager.getDirectoryState();

		const pagesMatch = state.pageCount === expectedPages;
		const foldersMatch = state.folderCount === expectedFolders;

		if (pagesMatch && foldersMatch) {
			return {
				passed: true,
				message: `File counts match expectations: ${expectedPages} pages, ${expectedFolders} folders`,
				details: state
			};
		}

		return {
			passed: false,
			message: `File count mismatch. Expected: ${expectedPages} pages, ${expectedFolders} folders. Actual: ${state.pageCount} pages, ${state.folderCount} folders`,
			details: state
		};
	}

	async assertFileCounts(expectedPages: number, expectedFolders: number): Promise<void> {
		const result = await this.validateFileCounts(expectedPages, expectedFolders);

		if (!result.passed) {
			console.error(`[Monitor ${this.workerIndex}] ${result.message}`, result.details);
			throw new Error(result.message);
		}

		console.log(`[Monitor ${this.workerIndex}] ✅ ${result.message}`);
	}

	async validateStateChange(
		beforeState: DirectoryState,
		expectedPageDelta: number,
		expectedFolderDelta: number
	): Promise<TestValidationResult> {
		const maxRetries = 5;
		const baseDelay = 200;

		for (let attempt = 0; attempt <= maxRetries; attempt++) {
			if (attempt > 0) {
				const delay = baseDelay * attempt;
				await new Promise((resolve) => setTimeout(resolve, delay));
			}

			const afterState = await this.directoryManager.getDirectoryState();

			const actualPageDelta = afterState.pageCount - beforeState.pageCount;
			const actualFolderDelta = afterState.folderCount - beforeState.folderCount;

			const pagesDeltaMatch = actualPageDelta === expectedPageDelta;
			const foldersDeltaMatch = actualFolderDelta === expectedFolderDelta;

			if (pagesDeltaMatch && foldersDeltaMatch) {
				if (attempt > 0) {
					console.log(
						`[Monitor ${this.workerIndex}] ✅ State validation succeeded on attempt ${attempt + 1}`
					);
				}
				return {
					passed: true,
					message: `State change matches expectations: pages ${expectedPageDelta >= 0 ? '+' : ''}${expectedPageDelta}, folders ${expectedFolderDelta >= 0 ? '+' : ''}${expectedFolderDelta}`,
					details: {
						beforeState,
						afterState,
						actualPageDelta,
						actualFolderDelta,
						attempts: attempt + 1
					}
				};
			}

			if (attempt < maxRetries) {
				console.log(
					`[Monitor ${this.workerIndex}] State validation attempt ${attempt + 1} failed, retrying... Expected: pages ${expectedPageDelta >= 0 ? '+' : ''}${expectedPageDelta}, folders ${expectedFolderDelta >= 0 ? '+' : ''}${expectedFolderDelta}. Actual: pages ${actualPageDelta >= 0 ? '+' : ''}${actualPageDelta}, folders ${actualFolderDelta >= 0 ? '+' : ''}${actualFolderDelta}`
				);
			}
		}

		const finalState = await this.directoryManager.getDirectoryState();
		const finalPageDelta = finalState.pageCount - beforeState.pageCount;
		const finalFolderDelta = finalState.folderCount - beforeState.folderCount;

		return {
			passed: false,
			message: `State change mismatch after ${maxRetries + 1} attempts. Expected: pages ${expectedPageDelta >= 0 ? '+' : ''}${expectedPageDelta}, folders ${expectedFolderDelta >= 0 ? '+' : ''}${expectedFolderDelta}. Actual: pages ${finalPageDelta >= 0 ? '+' : ''}${finalPageDelta}, folders ${finalFolderDelta >= 0 ? '+' : ''}${finalFolderDelta}`,
			details: {
				beforeState,
				afterState: finalState,
				actualPageDelta: finalPageDelta,
				actualFolderDelta: finalFolderDelta,
				attempts: maxRetries + 1
			}
		};
	}

	async assertStateChange(
		beforeState: DirectoryState,
		expectedPageDelta: number,
		expectedFolderDelta: number
	): Promise<void> {
		const result = await this.validateStateChange(
			beforeState,
			expectedPageDelta,
			expectedFolderDelta
		);

		if (!result.passed) {
			console.error(`[Monitor ${this.workerIndex}] ${result.message}`, result.details);
			throw new Error(result.message);
		}

		console.log(`[Monitor ${this.workerIndex}] ✅ ${result.message}`);
	}

	async validateCleanDirectory(): Promise<TestValidationResult> {
		const state = await this.directoryManager.getDirectoryState();

		if (state.pageCount === 0 && state.folderCount === 0) {
			return {
				passed: true,
				message: 'Directory is clean',
				details: state
			};
		}

		return {
			passed: false,
			message: `Directory is not clean: ${state.pageCount} pages, ${state.folderCount} folders remaining`,
			details: state
		};
	}

	async assertCleanDirectory(): Promise<void> {
		const result = await this.validateCleanDirectory();

		if (!result.passed) {
			console.error(`[Monitor ${this.workerIndex}] ${result.message}`, result.details);
			throw new Error(result.message);
		}

		console.log(`[Monitor ${this.workerIndex}] ✅ ${result.message}`);
	}

	async monitorOperation<T>(
		operationName: string,
		operation: () => Promise<T>,
		expectedPageDelta: number,
		expectedFolderDelta: number
	): Promise<T> {
		console.log(`[Monitor ${this.workerIndex}] Starting monitored operation: ${operationName}`);

		const beforeState = await this.recordState(`before ${operationName}`);

		try {
			const result = await operation();

			await this.assertStateChange(beforeState, expectedPageDelta, expectedFolderDelta);

			console.log(
				`[Monitor ${this.workerIndex}] ✅ Operation completed successfully: ${operationName}`
			);
			return result;
		} catch (error) {
			console.error(`[Monitor ${this.workerIndex}] ❌ Operation failed: ${operationName}`, error);
			await this.recordState(`after failed ${operationName}`);
			throw error;
		}
	}

	async validateIsolation(): Promise<TestValidationResult> {
		const isIsolated = await this.directoryManager.verifyIsolation();

		if (isIsolated) {
			return {
				passed: true,
				message: 'Test isolation verified - no cross-worker contamination detected'
			};
		}

		return {
			passed: false,
			message: 'Test isolation failure - cross-worker contamination detected'
		};
	}

	async assertIsolation(): Promise<void> {
		const result = await this.validateIsolation();

		if (!result.passed) {
			console.error(`[Monitor ${this.workerIndex}] ${result.message}`);
			throw new Error(result.message);
		}

		console.log(`[Monitor ${this.workerIndex}] ✅ ${result.message}`);
	}

	getStateHistory(): DirectoryState[] {
		return [...this.stateHistory];
	}

	getPerformanceSummary(): {
		workerIndex: number;
		stateRecords: number;
		cleanupOperations: number;
		totalCleanupTime: number;
		averageCleanupTime: number;
		totalItemsDeleted: number;
		totalErrors: number;
	} {
		const cleanupMetrics = this.directoryManager.getCleanupMetrics();

		return {
			workerIndex: this.workerIndex,
			stateRecords: this.stateHistory.length,
			cleanupOperations: cleanupMetrics.length,
			totalCleanupTime: cleanupMetrics.reduce((sum, metric) => sum + metric.duration, 0),
			averageCleanupTime:
				cleanupMetrics.length > 0
					? cleanupMetrics.reduce((sum, metric) => sum + metric.duration, 0) / cleanupMetrics.length
					: 0,
			totalItemsDeleted: cleanupMetrics.reduce((sum, metric) => sum + metric.itemsDeleted, 0),
			totalErrors: cleanupMetrics.reduce((sum, metric) => sum + metric.errors.length, 0)
		};
	}

	logPerformanceSummary(): void {
		const summary = this.getPerformanceSummary();
		console.log(`[Monitor ${this.workerIndex}] Performance Summary:`, summary);
	}
}

export function createTestMonitor(
	directoryManager: DirectoryManager,
	workerIndex: number
): TestMonitor {
	return new TestMonitor(directoryManager, workerIndex);
}
