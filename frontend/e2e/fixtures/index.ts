/**
 * Main exports for e2e test fixtures
 */

// Re-export test and expect from our fixtures
export { test, expect } from './test-data-fixtures';

// Export page objects for direct use
export { HomePage } from '../pages/HomePage';
export { EditorPage } from '../pages/EditorPage';
export { PageViewPage } from '../pages/PageViewPage';
export { FolderPage } from '../pages/FolderPage';
export { BasePage } from '../pages/BasePage';

// Export utilities
export { ApiHelper } from '../utils/api-helpers';
export * from '../utils/test-data';
export * from '../utils/assertions';

// Common test patterns and helpers
export async function setupCleanState(apiHelper: ApiHelper) {
	await apiHelper.cleanupTestData();
}

export async function waitForAppReady(page: import('@playwright/test').Page) {
	await page.waitForLoadState('networkidle');

	// Wait for any loading indicators to disappear
	const loadingIndicators = page.locator('[data-testid="loading"], .loading');
	if ((await loadingIndicators.count()) > 0) {
		await loadingIndicators.first().waitFor({ state: 'hidden', timeout: 5000 });
	}
}
