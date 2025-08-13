/**
 * Test setup fixtures for e2e tests
 * Only essential cleanup - removes complex DirectoryManager logic
 */

import { test as base } from '@playwright/test';
import { readFileSync, statSync } from 'fs';
// @ts-expect-error - Node.js types may not be fully configured in e2e environment
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { HomePage } from '../pages/HomePage';
import { EditorPage } from '../pages/EditorPage';
import { DocumentViewPage } from '../pages/DocumentViewPage';
import { FolderPage } from '../pages/FolderPage';
import { SettingsPage } from '../pages/SettingsPage';
import { ApiHelper } from '../utils/api-helpers';
import { generateTestId } from '../utils/test-data';

const execFileAsync = promisify(execFile);
const DEFAULT_NAVIGATION_TIMEOUT_MILLIS = 10000;

async function runCleanupScript() {
	try {
		console.log('[Cleanup] Running E2E cleanup script...');
		const scriptsDir = path.resolve(__dirname, '../../scripts');
		const cleanupScript = path.resolve(scriptsDir, 'cleanup.sh');

		// Validate that cleanupScript is inside scriptsDir
		if (!cleanupScript.startsWith(scriptsDir + path.sep)) {
			throw new Error('Cleanup script path is outside the expected scripts directory');
		}

		// Check that the file exists and is executable
		let stat;
		try {
			stat = statSync(cleanupScript);
		} catch (_err) {
			throw new Error('Cleanup script does not exist');
		}

		if (!stat.isFile()) {
			throw new Error('Cleanup script is not a file');
		}

		// Optionally check executable bit (Unix only)
		if ((stat.mode & 0o111) === 0) {
			throw new Error('Cleanup script is not executable');
		}

		const { stdout, stderr } = await execFileAsync(cleanupScript, ['--profile=e2e-only']);

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

if (typeof process !== 'undefined') {
	process.on('exit', () => {
		runCleanupScript().catch(() => {});
	});

	process.on('SIGINT', async () => {
		console.log('\n[Signal] CTRL+C detected - running cleanup...');
		await runCleanupScript();
		process.exit(0);
	});

	process.on('SIGTERM', async () => {
		console.log('\n[Signal] SIGTERM detected - running cleanup...');
		await runCleanupScript();
		process.exit(0);
	});

	process.on('uncaughtException', async (error: Error) => {
		console.error('Uncaught exception:', error);
		await runCleanupScript();
		process.exit(1);
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
