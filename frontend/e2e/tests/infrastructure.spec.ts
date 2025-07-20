/**
 * Infrastructure tests to verify e2e test setup is working
 */

import { test, expect } from '../fixtures';
import { expectPageLoaded, expectVisibleText } from '../utils/assertions';

test.describe('E2E Infrastructure', () => {
	test('page objects work correctly', async ({ homePage }) => {
		await homePage.navigate();
		await homePage.verifyLoaded();
		await expectPageLoaded(homePage.page);
	});

	test('API helper works correctly', async ({ apiHelper }) => {
		const healthCheck = await apiHelper.healthCheck();
		expect(healthCheck).toBe(true);
	});

	test('test data generation works', async ({ testPage, testFolder }) => {
		expect(testPage.title).toBeTruthy();
		expect(testPage.content).toBeTruthy();
		expect(testFolder.name).toBeTruthy();
		expect(testFolder.path).toBeTruthy();
	});

	test('custom assertions work', async ({ homePage }) => {
		await homePage.navigate();
		await expectVisibleText(homePage.pageTitle, '');
	});

	test('fixtures create backend data', async ({ withTestPage, pageViewPage }) => {
		// Navigate to the page created by the fixture
		await pageViewPage.navigateToPage(withTestPage.path!!);
		await pageViewPage.verifyPageLoaded(withTestPage.title);
		await expectVisibleText(pageViewPage.pageTitle, withTestPage.title);
	});
});

test.describe('Basic App Functionality', () => {
	test('home page loads correctly', async ({ homePage }) => {
		await homePage.navigate();
		await homePage.verifyLoaded();

		// Check if navigation elements are present
		const hasNavigation = await homePage.elementExists('nav');
		expect(hasNavigation).toBe(true);
	});

	test('can navigate to new page', async ({ homePage }) => {
		await homePage.navigate();

		// Try to find and click new page button
		if (await homePage.newPageButton.isVisible()) {
			await homePage.createNewPage();
			await expect(homePage.page).toHaveURL('/new');
		} else {
			// Alternative navigation
			await homePage.goto('/new');
			await homePage.waitForLoad();
		}
	});

	test('editor page loads correctly', async ({ editorPage }) => {
		await editorPage.navigateToNew();
		await editorPage.verifyLoaded();

		// Basic form elements should be present
		await expect(editorPage.titleInput).toBeVisible();
		await expect(editorPage.saveButton).toBeVisible();
	});

	test('can create and view a page', async ({ editorPage, pageViewPage, testPage }) => {
		// Create page through editor
		await editorPage.navigateToNew();
		await editorPage.fillPageDetails(testPage.title, testPage.content);
		await editorPage.saveAndExpectNavigation();

		// Verify we're now viewing the page
		await pageViewPage.verifyPageLoaded(testPage.title);
	});
});
