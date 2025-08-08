/**
 * Test setup fixtures for e2e tests
 */

import { test as base } from '@playwright/test';
import { readFileSync } from 'fs';
import { HomePage } from '../pages/HomePage';
import { EditorPage } from '../pages/EditorPage';
import { DocumentViewPage } from '../pages/DocumentViewPage';
import { FolderPage } from '../pages/FolderPage';
import { ApiHelper } from '../utils/api-helpers';
import { DirectoryManager, createDirectoryManager } from '../utils/directory-manager';
import { TestMonitor, createTestMonitor } from '../utils/test-monitor';
import { generateTestId } from '../utils/test-data';

const DEFAULT_NAVIGATION_TIMEOUT_MILLIS = 10000;
const globalCleanupRegistry = new Map<number, DirectoryManager>();

async function performGlobalCleanup() {
	console.log('Performing global test data cleanup...');
	for (const [workerIndex, manager] of globalCleanupRegistry.entries()) {
		try {
			console.log(`[Worker ${workerIndex}] Global cleanup...`);
			await manager.emergencyCleanup();
			console.log(`[Worker ${workerIndex}] Global cleanup completed`);
		} catch (error) {
			console.error(`[Worker ${workerIndex}] Global cleanup failed:`, error);
		}
	}
	globalCleanupRegistry.clear();
}

if (typeof globalThis.process !== 'undefined') {
	globalThis.process.on('exit', () => {
		performGlobalCleanup().catch(() => {});
	});

	globalThis.process.on('SIGINT', async () => {
		await performGlobalCleanup();
		globalThis.process.exit(0);
	});

	globalThis.process.on('SIGTERM', async () => {
		await performGlobalCleanup();
		globalThis.process.exit(0);
	});

	globalThis.process.on('uncaughtException', async (error: Error) => {
		console.error('Uncaught exception:', error);
		await performGlobalCleanup();
		globalThis.process.exit(1);
	});
}

export const test = base.extend<{
	homePage: HomePage;
	editorPage: EditorPage;
	documentViewPage: DocumentViewPage;
	folderPage: FolderPage;
	apiHelper: ApiHelper;
	directoryManager: DirectoryManager;
	testMonitor: TestMonitor;
	testId: string;
	workerBaseURL: string;
}>({
	homePage: async ({ page, workerBaseURL }, use) => {
		page.setDefaultNavigationTimeout(DEFAULT_NAVIGATION_TIMEOUT_MILLIS);
		await page.goto(workerBaseURL);
		const homePage = new HomePage(page);
		await use(homePage);
	},

	editorPage: async ({ page, workerBaseURL }, use) => {
		await page.goto(workerBaseURL);
		const editorPage = new EditorPage(page);
		await use(editorPage);
	},

	documentViewPage: async ({ page, workerBaseURL }, use) => {
		await page.goto(workerBaseURL);
		const documentViewPage = new DocumentViewPage(page);
		await use(documentViewPage);
	},

	folderPage: async ({ page, workerBaseURL }, use) => {
		await page.goto(workerBaseURL);
		const folderPage = new FolderPage(page);
		await use(folderPage);
	},

	directoryManager: async ({ request }, use, testInfo) => {
		const workerIndex = testInfo.parallelIndex || 0;
		const directoryManager = createDirectoryManager(request, workerIndex);

		globalCleanupRegistry.set(workerIndex, directoryManager);

		try {
			await use(directoryManager);

			await directoryManager.logDirectoryState('Before cleanup');
			await directoryManager.performAggressiveCleanup();

			const isClean = await directoryManager.validateCleanState();
			if (!isClean) {
				console.warn(`Worker ${workerIndex} cleanup verification failed`);
				await directoryManager.emergencyCleanup();
			}

			await directoryManager.logDirectoryState('After cleanup');
		} finally {
			globalCleanupRegistry.delete(workerIndex);
		}
	},

	testMonitor: async ({ directoryManager }, use, testInfo) => {
		const testMonitor = createTestMonitor(directoryManager, testInfo.parallelIndex || 0);

		await testMonitor.recordState('Test started');
		await testMonitor.assertIsolation();

		await use(testMonitor);

		testMonitor.logPerformanceSummary();
	},

	apiHelper: async ({ request }, use, testInfo) => {
		let apiHelper: ApiHelper;

		const projectName = testInfo.project.name;
		if (projectName === 'auth-disabled') {
			apiHelper = new ApiHelper(request, 0, 'http://localhost:8081/api');
		} else if (projectName === 'auth-enabled') {
			apiHelper = new ApiHelper(request, 0, 'http://localhost:8082/api');

			// Read auth token from storage state for auth-enabled project
			try {
				const authData = JSON.parse(readFileSync('playwright/.auth/user.json', 'utf8'));
				const token = authData.origins?.[0]?.localStorage?.find(
					(item: { name: string; value: string }) => item.name === 'schist_auth_token'
				)?.value;
				if (token) {
					apiHelper.setAuthToken(token);
				}
			} catch (error) {
				console.warn('Failed to load auth token for API helper:', error);
			}
		} else {
			// Default behavior for setup and other tests
			apiHelper = new ApiHelper(request, testInfo.parallelIndex);
		}

		await use(apiHelper);

		try {
			console.log(`[ApiHelper] Starting cleanup for project ${projectName}`);
			await apiHelper.cleanupTestData();
			console.log(`[ApiHelper] Cleanup completed for project ${projectName}`);
		} catch (error) {
			console.error(`[ApiHelper] Cleanup failed for project ${projectName}:`, error);
		}
	},

	// eslint-disable-next-line no-empty-pattern
	testId: async ({}, use) => {
		const testId = generateTestId();
		await use(testId);
	},

	// eslint-disable-next-line no-empty-pattern
	workerBaseURL: async ({}, use, testInfo) => {
		// parallelIndex: 0 -> port 4173, 1 -> port 4174, etc.
		const port = 4173 + (testInfo.parallelIndex || 0);
		const baseURL = `http://localhost:${port}`;
		await use(baseURL);
	}
});

export { expect } from '@playwright/test';
