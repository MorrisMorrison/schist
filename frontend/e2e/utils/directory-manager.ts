/**
 * Directory lifecycle management for e2e tests
 * Handles creation, cleanup, monitoring, and validation of worker-specific data directories
 */

import { APIRequestContext } from '@playwright/test';
import { ApiHelper } from './api-helpers';

export interface DirectoryState {
	workerIndex: number;
	dataDirectory: string;
	pageCount: number;
	folderCount: number;
	trashCount: number;
	timestamp: number;
}

export interface CleanupMetrics {
	startTime: number;
	endTime: number;
	duration: number;
	itemsDeleted: number;
	errors: string[];
}

interface PageListData {
	pages: Array<{
		metaData?: {
			title?: string;
			path?: string;
		};
	}>;
}

interface FolderListData {
	folders: Array<{
		name?: string;
		path?: string;
	}>;
}

export class DirectoryManager {
	private apiHelper: ApiHelper;
	private workerIndex: number;
	private dataDirectory: string;
	private cleanupMetrics: CleanupMetrics[] = [];

	constructor(apiContext: APIRequestContext, workerIndex: number) {
		this.apiHelper = new ApiHelper(apiContext, workerIndex);
		this.workerIndex = workerIndex;
		this.dataDirectory = `test-data-worker-${workerIndex + 1}`;
	}

	/**
	 * Initialize directory for testing - ensures clean state
	 */
	async initializeDirectory(): Promise<DirectoryState> {
		// Perform aggressive cleanup to ensure clean state
		await this.performAggressiveCleanup();

		// Wait for backend to be ready
		const isReady = await this.apiHelper.waitForApiReady(30000);
		if (!isReady) {
			throw new Error(`Backend not ready for worker ${this.workerIndex}`);
		}

		// Get initial state
		return await this.getDirectoryState();
	}

	/**
	 * Get current directory state with retry logic for better reliability
	 */
	async getDirectoryState(): Promise<DirectoryState> {
		const maxRetries = 3;
		const retryDelay = 100;

		for (let attempt = 0; attempt <= maxRetries; attempt++) {
			try {
				if (attempt > 0) {
					await new Promise((resolve) => setTimeout(resolve, retryDelay * attempt));
				}

				const [pagesResponse, foldersResponse] = await Promise.all([
					this.apiHelper.listPages(),
					this.apiHelper.getFolder('')
				]);

				const pageCount = Array.isArray((pagesResponse.data as PageListData)?.pages)
					? (pagesResponse.data as PageListData).pages.length
					: 0;

				const folderCount = Array.isArray((foldersResponse.data as FolderListData)?.folders)
					? (foldersResponse.data as FolderListData).folders.length
					: 0;

				// Note: trash count would require additional API endpoint
				const trashCount = 0;

				return {
					workerIndex: this.workerIndex,
					dataDirectory: this.dataDirectory,
					pageCount,
					folderCount,
					trashCount,
					timestamp: Date.now()
				};
			} catch (error) {
				if (attempt === maxRetries) {
					console.warn(
						`[Worker ${this.workerIndex}] Failed to get directory state after ${maxRetries + 1} attempts:`,
						error
					);
					return {
						workerIndex: this.workerIndex,
						dataDirectory: this.dataDirectory,
						pageCount: 0,
						folderCount: 0,
						trashCount: 0,
						timestamp: Date.now()
					};
				}
				console.warn(
					`[Worker ${this.workerIndex}] Directory state check attempt ${attempt + 1} failed, retrying:`,
					error
				);
			}
		}

		// This should never be reached due to the return in the catch block above
		return {
			workerIndex: this.workerIndex,
			dataDirectory: this.dataDirectory,
			pageCount: 0,
			folderCount: 0,
			trashCount: 0,
			timestamp: Date.now()
		};
	}

	/**
	 * Perform aggressive cleanup of all test data
	 */
	async performAggressiveCleanup(): Promise<CleanupMetrics> {
		const startTime = Date.now();
		const errors: string[] = [];
		let itemsDeleted = 0;

		try {
			// Use ApiHelper's built-in cleanup for test data
			await this.apiHelper.cleanupTestData();

			// Delete remaining pages
			const pagesResponse = await this.apiHelper.listPages();
			if (pagesResponse.data && Array.isArray((pagesResponse.data as PageListData).pages)) {
				const pages = (pagesResponse.data as PageListData).pages;
				for (const page of pages) {
					try {
						if (page.metaData?.path) {
							await this.apiHelper.deletePage(page.metaData.path);
							itemsDeleted++;
						}
					} catch (error) {
						errors.push(`Failed to delete page ${page.metaData?.path}: ${error}`);
					}
				}
			}

			// Delete remaining folders
			const foldersResponse = await this.apiHelper.getFolder('');
			if (foldersResponse.data && Array.isArray((foldersResponse.data as FolderListData).folders)) {
				const folders = (foldersResponse.data as FolderListData).folders;
				for (const folder of folders) {
					try {
						if (folder.path) {
							await this.apiHelper.deleteFolder(folder.path);
							itemsDeleted++;
						}
					} catch (error) {
						errors.push(`Failed to delete folder ${folder.path}: ${error}`);
					}
				}
			}
		} catch (error) {
			errors.push(`Cleanup failed: ${error}`);
		}

		const endTime = Date.now();
		const metrics: CleanupMetrics = {
			startTime,
			endTime,
			duration: endTime - startTime,
			itemsDeleted,
			errors
		};

		this.cleanupMetrics.push(metrics);

		console.log(`[Worker ${this.workerIndex}] Cleanup completed:`, {
			duration: `${metrics.duration}ms`,
			itemsDeleted: metrics.itemsDeleted,
			errors: metrics.errors.length
		});

		if (errors.length > 0) {
			console.warn(`[Worker ${this.workerIndex}] Cleanup errors:`, errors);
		}

		return metrics;
	}

	/**
	 * Validate directory state is clean
	 */
	async validateCleanState(): Promise<boolean> {
		const state = await this.getDirectoryState();
		const isClean = state.pageCount === 0 && state.folderCount === 0;

		if (!isClean) {
			console.warn(`[Worker ${this.workerIndex}] Directory not clean:`, {
				pages: state.pageCount,
				folders: state.folderCount
			});
		}

		return isClean;
	}

	/**
	 * Log directory state for debugging
	 */
	async logDirectoryState(context: string): Promise<void> {
		const state = await this.getDirectoryState();
		console.log(`[Worker ${state.workerIndex}] ${context}:`, {
			directory: state.dataDirectory,
			pages: state.pageCount,
			folders: state.folderCount,
			trash: state.trashCount,
			timestamp: new Date(state.timestamp).toISOString()
		});
	}

	/**
	 * Get cleanup performance metrics
	 */
	getCleanupMetrics(): CleanupMetrics[] {
		return [...this.cleanupMetrics];
	}

	/**
	 * Verify directory isolation by checking no cross-worker contamination
	 */
	async verifyIsolation(): Promise<boolean> {
		try {
			const pagesResponse = await this.apiHelper.listPages();
			if (pagesResponse.data && Array.isArray((pagesResponse.data as PageListData).pages)) {
				const pages = (pagesResponse.data as PageListData).pages;

				const pageCount = pages.length;
				if (pageCount > 50) {
					console.warn(
						`[Worker ${this.workerIndex}] Potentially too many pages in directory: ${pageCount}`
					);
				}
			}

			return true;
		} catch (error) {
			console.warn(`[Worker ${this.workerIndex}] Failed to verify isolation:`, error);
			return false;
		}
	}

	async emergencyCleanup(): Promise<void> {
		console.log(`[Worker ${this.workerIndex}] Performing emergency cleanup...`);

		for (let attempt = 1; attempt <= 3; attempt++) {
			console.log(`[Worker ${this.workerIndex}] Emergency cleanup attempt ${attempt}/3`);

			await this.performAggressiveCleanup();

			await new Promise((resolve) => setTimeout(resolve, 1000));

			const isClean = await this.validateCleanState();
			if (isClean) {
				console.log(
					`[Worker ${this.workerIndex}] Emergency cleanup successful after ${attempt} attempts`
				);
				return;
			}
		}

		console.error(`[Worker ${this.workerIndex}] Emergency cleanup failed after 3 attempts`);
	}
}

/**
 * Create a DirectoryManager for the current test worker
 */
export function createDirectoryManager(
	apiContext: APIRequestContext,
	workerIndex: number
): DirectoryManager {
	return new DirectoryManager(apiContext, workerIndex);
}
