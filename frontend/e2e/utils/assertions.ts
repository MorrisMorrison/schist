/**
 * Custom assertion helpers for e2e tests
 */

import { type Page, type Locator, expect } from '@playwright/test';

/**
 * Assert that page title matches expected value
 */
export async function expectPageTitle(page: Page, expectedTitle: string) {
	await expect(page).toHaveTitle(new RegExp(expectedTitle, 'i'));
}

/**
 * Assert that current URL matches expected pattern
 */
export async function expectCurrentUrl(page: Page, expectedUrl: string | RegExp) {
	await expect(page).toHaveURL(expectedUrl);
}

/**
 * Assert that element is visible and contains text
 */
export async function expectVisibleText(locator: Locator, expectedText: string) {
	await expect(locator).toBeVisible();
	await expect(locator).toContainText(expectedText);
}

/**
 * Assert that input has specific value
 */
export async function expectInputValue(locator: Locator, expectedValue: string) {
	await expect(locator).toBeVisible();
	await expect(locator).toHaveValue(expectedValue);
}

/**
 * Assert that element exists in DOM (even if not visible)
 */
export async function expectElementExists(page: Page, selector: string) {
	const element = page.locator(selector);
	await expect(element).toHaveCount(1);
}

/**
 * Assert that element does not exist in DOM
 */
export async function expectElementNotExists(page: Page, selector: string) {
	const element = page.locator(selector);
	await expect(element).toHaveCount(0);
}

/**
 * Assert that loading state is complete
 */
export async function expectPageLoaded(page: Page) {
	await page.waitForLoadState('networkidle');
	await expect(page.locator('[data-testid="loading"]')).not.toBeVisible();
}

/**
 * Assert that error message is displayed
 */
export async function expectErrorMessage(page: Page, expectedError?: string) {
	const errorElement = page.locator('[data-testid="error"], .error-message, .alert-error');
	await expect(errorElement).toBeVisible();

	if (expectedError) {
		await expect(errorElement).toContainText(expectedError);
	}
}

/**
 * Assert that success message is displayed
 */
export async function expectSuccessMessage(page: Page, expectedMessage?: string) {
	const successElement = page.locator('[data-testid="success"], .success-message, .alert-success');
	await expect(successElement).toBeVisible();

	if (expectedMessage) {
		await expect(successElement).toContainText(expectedMessage);
	}
}

/**
 * Assert that form validation error is shown
 */
export async function expectValidationError(locator: Locator, expectedError?: string) {
	// Check for various validation error patterns
	const errorElement = locator
		.locator('..')
		.locator('.error, .invalid, [data-testid="field-error"]');
	await expect(errorElement).toBeVisible();

	if (expectedError) {
		await expect(errorElement).toContainText(expectedError);
	}
}

/**
 * Assert that modal is open
 */
export async function expectModalOpen(page: Page, modalSelector?: string) {
	const modal = modalSelector
		? page.locator(modalSelector)
		: page.locator('[role="dialog"], .modal, [data-testid*="modal"]');

	await expect(modal).toBeVisible();
}

/**
 * Assert that modal is closed
 */
export async function expectModalClosed(page: Page, modalSelector?: string) {
	const modal = modalSelector
		? page.locator(modalSelector)
		: page.locator('[role="dialog"], .modal, [data-testid*="modal"]');

	await expect(modal).not.toBeVisible();
}

/**
 * Assert that dropdown/menu is open
 */
export async function expectDropdownOpen(locator: Locator) {
	await expect(locator).toBeVisible();
	await expect(locator).toHaveAttribute('aria-expanded', 'true');
}

/**
 * Assert that dropdown/menu is closed
 */
export async function expectDropdownClosed(locator: Locator) {
	await expect(locator).toHaveAttribute('aria-expanded', 'false');
}

/**
 * Assert that button is in loading state
 */
export async function expectButtonLoading(locator: Locator) {
	await expect(locator).toBeDisabled();

	// Check for loading indicators
	const loadingIndicator = locator.locator('.loading, .spinner, [data-testid="loading"]');
	await expect(loadingIndicator).toBeVisible();
}

/**
 * Assert that button is not in loading state
 */
export async function expectButtonNotLoading(locator: Locator) {
	await expect(locator).toBeEnabled();

	// Ensure no loading indicators
	const loadingIndicator = locator.locator('.loading, .spinner, [data-testid="loading"]');
	await expect(loadingIndicator).not.toBeVisible();
}

/**
 * Assert that list contains specific items
 */
export async function expectListContains(listLocator: Locator, expectedItems: string[]) {
	for (const item of expectedItems) {
		const itemElement = listLocator.getByText(item);
		await expect(itemElement).toBeVisible();
	}
}

/**
 * Assert that list has specific count
 */
export async function expectListCount(listLocator: Locator, expectedCount: number) {
	await expect(listLocator).toHaveCount(expectedCount);
}

/**
 * Assert that breadcrumb path is correct
 */
export async function expectBreadcrumbPath(page: Page, expectedPath: string[]) {
	const breadcrumbs = page.locator('[data-testid="breadcrumbs"] a, .breadcrumbs a');

	for (let i = 0; i < expectedPath.length; i++) {
		const breadcrumb = breadcrumbs.nth(i);
		await expect(breadcrumb).toContainText(expectedPath[i]);
	}
}

/**
 * Assert that search results are displayed
 */
export async function expectSearchResults(page: Page, resultCount?: number) {
	const results = page.locator('[data-testid="search-results"] [data-testid="search-result"]');
	await expect(results.first()).toBeVisible();

	if (resultCount !== undefined) {
		await expect(results).toHaveCount(resultCount);
	}
}

/**
 * Assert that no search results are found
 */
export async function expectNoSearchResults(page: Page) {
	const noResults = page.locator('[data-testid="no-results"], .no-results');
	await expect(noResults).toBeVisible();
}

/**
 * Assert that image is loaded and visible
 */
export async function expectImageLoaded(locator: Locator) {
	await expect(locator).toBeVisible();

	// Check that image has loaded (has naturalWidth)
	const hasLoaded = await locator.evaluate((img: HTMLImageElement) => {
		return img.complete && img.naturalWidth > 0;
	});

	expect(hasLoaded).toBe(true);
}

/**
 * Assert that table has specific row count
 */
export async function expectTableRowCount(tableLocator: Locator, expectedCount: number) {
	const rows = tableLocator.locator('tbody tr, tr:not(:first-child)');
	await expect(rows).toHaveCount(expectedCount);
}

/**
 * Assert that code block contains specific content
 */
export async function expectCodeBlock(page: Page, expectedCode: string) {
	const codeBlock = page.locator('pre code, .code-block code');
	await expect(codeBlock).toContainText(expectedCode);
}

/**
 * Assert that markdown is rendered (no raw markdown visible)
 */
export async function expectMarkdownRendered(contentLocator: Locator) {
	// Ensure no raw markdown syntax is visible
	await expect(contentLocator).not.toContainText('# ');
	await expect(contentLocator).not.toContainText('## ');
	await expect(contentLocator).not.toContainText('**');
	await expect(contentLocator).not.toContainText('```');

	// Ensure HTML elements are present
	const headings = contentLocator.locator('h1, h2, h3, h4, h5, h6');
	const hasHeadings = (await headings.count()) > 0;

	if (hasHeadings) {
		await expect(headings.first()).toBeVisible();
	}
}

/**
 * Assert that copy operation was successful
 */
export async function expectCopySuccess(page: Page) {
	// Check for copy success feedback
	const copyFeedback = page.locator('[data-testid="copy-success"], .copy-success');
	await expect(copyFeedback).toBeVisible();

	// Wait for feedback to disappear
	await expect(copyFeedback).not.toBeVisible({ timeout: 5000 });
}

/**
 * Assert that auto-save indicator is shown
 */
export async function expectAutoSaved(page: Page) {
	const autoSaveIndicator = page.locator('[data-testid="auto-saved"], .auto-saved');
	await expect(autoSaveIndicator).toBeVisible();
}

/**
 * Assert that unsaved changes indicator is shown
 */
export async function expectUnsavedChanges(page: Page) {
	const unsavedIndicator = page.locator('[data-testid="unsaved-changes"], .unsaved-changes');
	await expect(unsavedIndicator).toBeVisible();
}

/**
 * Assert that theme has changed
 */
export async function expectTheme(page: Page, theme: 'light' | 'dark') {
	const body = page.locator('body');

	if (theme === 'dark') {
		await expect(body).toHaveClass(/dark/);
	} else {
		await expect(body).not.toHaveClass(/dark/);
	}
}

/**
 * Assert that network request was made
 */
export async function expectNetworkRequest(page: Page, urlPattern: string | RegExp) {
	const responsePromise = page.waitForResponse(urlPattern);
	// The actual request should be triggered by the calling code
	const response = await responsePromise;
	expect(response.ok()).toBe(true);
}

/**
 * Assert that file upload was successful
 */
export async function expectFileUploadSuccess(page: Page, fileName?: string) {
	const uploadSuccess = page.locator('[data-testid="upload-success"], .upload-success');
	await expect(uploadSuccess).toBeVisible();

	if (fileName) {
		await expect(uploadSuccess).toContainText(fileName);
	}
}

/**
 * Assert that accessibility attributes are present
 */
export async function expectAccessibilityAttributes(locator: Locator) {
	// Check for common accessibility attributes
	const role = await locator.getAttribute('role');
	const ariaLabel = await locator.getAttribute('aria-label');
	const ariaLabelledBy = await locator.getAttribute('aria-labelledby');

	// At least one should be present
	expect(role || ariaLabel || ariaLabelledBy).toBeTruthy();
}

/**
 * Assert that keyboard navigation works
 */
export async function expectKeyboardNavigation(page: Page, elements: Locator[]) {
	for (let i = 0; i < elements.length; i++) {
		await page.keyboard.press('Tab');
		await expect(elements[i]).toBeFocused();
	}
}
