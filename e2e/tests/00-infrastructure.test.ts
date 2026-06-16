/**
 * Infrastructure tests to verify e2e test setup is working
 */

import { test, expect } from '../fixtures/test-data-fixtures';
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

	test('test data generation works', async ({ testDocument, testFolder }) => {
		expect(testDocument.title).toBeTruthy();
		expect(testDocument.content).toBeTruthy();
		expect(testFolder.name).toBeTruthy();
		expect(testFolder.path).toBeTruthy();
	});

	test('custom assertions work', async ({ homePage }) => {
		await homePage.navigate();
		await expectVisibleText(homePage.pageTitle, '');
	});

	test('fixtures create backend data', async ({ withTestDocument, documentViewPage }) => {
		// Navigate to the page created by the fixture
		await documentViewPage.navigateToPage(withTestDocument.path!);
		await documentViewPage.verifyPageLoaded(withTestDocument.title);
		await expectVisibleText(documentViewPage.pageTitle, withTestDocument.title);
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

		// Basic editor elements should be present
		await expect(editorPage.contentEditor).toBeVisible();
		await expect(editorPage.saveButton).toBeVisible();
	});

	test('can create and view a page', async ({ editorPage, documentViewPage, testDocument }) => {
		// Create page through editor
		await editorPage.navigateToNew();
		await editorPage.fillPageDetails(testDocument.title, testDocument.content);
		await editorPage.saveAndExpectNavigation();

		// Verify we're now viewing the page
		await documentViewPage.verifyPageLoaded(testDocument.title);
	});
});
