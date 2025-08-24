/**
 * Test setup fixtures for e2e tests
 * Only essential cleanup - removes complex DirectoryManager logic
 */

/// <reference types="node" />

import { test as base } from '@playwright/test';
import { readFileSync, statSync } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { HomePage } from '../pages/HomePage';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { EditorPage } from '../pages/EditorPage';
import { DocumentViewPage } from '../pages/DocumentViewPage';
import { FolderPage } from '../pages/FolderPage';
import { SettingsPage } from '../pages/SettingsPage';
import { ApiHelper } from '../utils/api-helpers';
import { generateTestId } from '../utils/test-data';

const execFileAsync = promisify(execFile);
const DEFAULT_NAVIGATION_TIMEOUT_MILLIS = 10000;

function findProjectRoot(startDir: string): string {
	let currentDir = startDir;
	while (currentDir !== path.dirname(currentDir)) {
		try {
			const makefilePath = path.join(currentDir, 'Makefile');
			const scriptsPath = path.join(currentDir, 'scripts');
			const backendPath = path.join(currentDir, 'backend');

			if (
				statSync(makefilePath).isFile() &&
				statSync(scriptsPath).isDirectory() &&
				statSync(backendPath).isDirectory()
			) {
				return currentDir;
			}
		} catch {
			// Continue searching
		}
		currentDir = path.dirname(currentDir);
	}
	throw new Error('Could not find schist project root');
}

async function runCleanupScript() {
	try {
		console.log('[Cleanup] Running E2E cleanup script...');

		// Find project root reliably
		const projectRoot = findProjectRoot(__dirname);
		const cleanupScript = path.join(projectRoot, 'scripts', 'cleanup.sh');
		console.log(`[Cleanup] Looking for cleanup script at: ${cleanupScript}`);

		// Check that the file exists and is executable
		let stat: ReturnType<typeof statSync>;
		try {
			stat = statSync(cleanupScript);
		} catch (err) {
			console.warn(`[Cleanup] Script not found: ${err}`);
			throw new Error(`Cleanup script does not exist at: ${cleanupScript}`);
		}

		if (!stat.isFile()) {
			throw new Error('Cleanup script is not a file');
		}

		// Optionally check executable bit (Unix only)
		if ((stat.mode & 0o111) === 0) {
			console.warn('[Cleanup] Script is not executable, attempting to run anyway...');
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
			// Use worker index 0 for auth-disabled container
			apiHelper = new ApiHelper(request, 0);
		} else if (projectName === 'auth-enabled' || projectName === 'auth-enabled-unauthenticated') {
			// Use worker index 1 for auth-enabled container
			apiHelper = new ApiHelper(request, 1);

			// Only load auth token for authenticated projects
			if (projectName === 'auth-enabled') {
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
			}
		} else {
			// Fallback for other project names
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
		const isCI = typeof process !== 'undefined' && process.env?.CI;
		let baseURL: string;
		
		if (isCI) {
			// In CI, use environment variables for container URLs
			const projectName = testInfo.project.name;
			if (projectName === 'auth-disabled') {
				baseURL = process.env?.E2E_AUTH_DISABLED_URL || 'http://localhost:8081';
			} else if (projectName === 'auth-enabled' || projectName === 'auth-enabled-unauthenticated') {
				baseURL = process.env?.E2E_AUTH_ENABLED_URL || 'http://localhost:8082';
			} else {
				// Fallback for other project names
				const port = 8081 + (testInfo.parallelIndex || 0);
				baseURL = `http://localhost:${port}`;
			}
		} else {
			// Local development - use localhost with appropriate port
			const port = 8081 + (testInfo.parallelIndex || 0);
			baseURL = `http://localhost:${port}`;
		}
		
		await use(baseURL);
	}
});

export { expect } from '@playwright/test';
