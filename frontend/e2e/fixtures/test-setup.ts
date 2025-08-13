/**
 * Test setup fixtures for e2e tests
 * Only essential cleanup - removes complex DirectoryManager logic
 */

import { test as base } from '@playwright/test';
// @ts-expect-error - Node.js modules work fine at runtime, IDE just needs better config
import { readFileSync } from 'fs';
// @ts-expect-error - Node.js module works at runtime
import { exec } from 'child_process';
// @ts-expect-error - Node.js module works at runtime
import { promisify } from 'util';
// @ts-expect-error - Node.js module works at runtime
import path from 'path';
import { HomePage } from '../pages/HomePage';
import { EditorPage } from '../pages/EditorPage';
import { DocumentViewPage } from '../pages/DocumentViewPage';
import { FolderPage } from '../pages/FolderPage';
import { SettingsPage } from '../pages/SettingsPage';
import { ApiHelper } from '../utils/api-helpers';
import { generateTestId } from '../utils/test-data';

const execAsync = promisify(exec);
const DEFAULT_NAVIGATION_TIMEOUT_MILLIS = 10000;

async function runCleanupScript() {
	try {
		console.log('[Cleanup] Running E2E cleanup script...');
		// @ts-expect-error - process works at runtime in Node environment
		const cleanupScript = path.resolve(process.cwd(), '../scripts/cleanup.sh');
		const { stdout, stderr } = await execAsync(`"${cleanupScript}" --profile=e2e-only`);

		if (stdout) {
			console.log('[Cleanup] Output:', stdout);
		}
		if (stderr) {
			console.warn('[Cleanup] Warnings:', stderr);
		}

		console.log('[Cleanup] ✅ Cleanup completed successfully');
	} catch (error) {
		console.warn('[Cleanup] ⚠️ Cleanup error:', error);
	}
}

if (typeof globalThis.process !== 'undefined') {
	globalThis.process.on('exit', () => {
		runCleanupScript().catch(() => {});
	});

	globalThis.process.on('SIGINT', async () => {
		console.log('\n[Signal] CTRL+C detected - running cleanup...');
		await runCleanupScript();
		globalThis.process.exit(0);
	});

	globalThis.process.on('SIGTERM', async () => {
		console.log('\n[Signal] SIGTERM detected - running cleanup...');
		await runCleanupScript();
		globalThis.process.exit(0);
	});

	globalThis.process.on('uncaughtException', async (error: Error) => {
		console.error('Uncaught exception:', error);
		await runCleanupScript();
		globalThis.process.exit(1);
	});
}

export const test = base.extend<{
	homePage: HomePage;
	editorPage: EditorPage;
	documentViewPage: DocumentViewPage;
	folderPage: FolderPage;
	settingsPage: SettingsPage;
	apiHelper: ApiHelper;
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

	settingsPage: async ({ page, workerBaseURL }, use) => {
		await page.goto(workerBaseURL);
		const settingsPage = new SettingsPage(page);
		await use(settingsPage);
	},

	apiHelper: async ({ request }, use, testInfo) => {
		let apiHelper: ApiHelper;

		const projectName = testInfo.project.name;
		if (projectName === 'auth-disabled') {
			apiHelper = new ApiHelper(request, 0, 'http://localhost:8081/api');
		} else if (projectName === 'auth-enabled') {
			apiHelper = new ApiHelper(request, 0, 'http://localhost:8082/api');

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
			apiHelper = new ApiHelper(request, testInfo.parallelIndex);
		}

		await use(apiHelper);

		try {
			await apiHelper.cleanupTestData();
		} catch (error) {
			console.warn(`[ApiHelper] Cleanup failed for project ${projectName}:`, error);
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
