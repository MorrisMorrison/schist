/**
 * Infrastructure tests to verify e2e test setup is working
 */

import { test, expect } from '../fixtures';

test.describe('E2E Infrastructure', () => {
	test('fixtures create backend data', async ({ withTestDocument, documentViewPage }) => {
		// Navigate to the page created by the fixture
		await documentViewPage.openDocument(withTestDocument);
	});
});

test.describe('Basic App Functionality', () => {
	test('home page loads correctly', async ({ homePage }) => {
		await homePage.navigate();
		await homePage.verifyLoaded();

		// Check if navigation elements are present
		await expect(homePage.page.locator('nav').first()).toBeAttached();
	});

	test('can navigate to new page', async ({ homePage }) => {
		await homePage.navigate();

		// The root folder view's "New Document" button opens the editor
		await homePage.createNewDocument();
		await expect(homePage.page).toHaveURL(/\/new$/);
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
		await editorPage.fillDocumentDetails(testDocument.title, testDocument.content);
		await editorPage.saveAndExpectNavigation();

		// Verify we're now viewing the page
		await documentViewPage.verifyDocumentLoaded(testDocument.title);
	});
});
