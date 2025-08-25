import { ApiHelper } from '../utils/api-helpers';

export { HomePage } from '../pages/HomePage';
export { EditorPage } from '../pages/EditorPage';
export { DocumentViewPage, PageViewPage } from '../pages/DocumentViewPage';
export { SharedDocumentPage } from '../pages/SharedDocumentPage';
export { FolderPage } from '../pages/FolderPage';
export { BasePage } from '../pages/BasePage';
export { SettingsPage } from '../pages/SettingsPage';

export { ApiHelper } from '../utils/api-helpers';

export async function setupCleanState(apiHelper: ApiHelper) {
	await apiHelper.cleanupTestData();
}

export async function waitForAppReady(page: import('@playwright/test').Page) {
	await page.waitForLoadState('networkidle');

	const loadingIndicators = page.locator('[data-testid="loading"], .loading');
	if ((await loadingIndicators.count()) > 0) {
		await loadingIndicators.first().waitFor({ state: 'hidden', timeout: 5000 });
	}
}

// Re-export test fixtures
export { test, expect } from './test-data-fixtures';
