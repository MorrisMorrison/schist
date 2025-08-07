import { type Page, type Locator, expect } from '@playwright/test';

export async function expectPageTitle(page: Page, expectedTitle: string) {
	await expect(page).toHaveTitle(new RegExp(expectedTitle, 'i'));
}

export async function expectCurrentUrl(page: Page, expectedUrl: string | RegExp) {
	await expect(page).toHaveURL(expectedUrl);
}

export async function expectVisibleText(locator: Locator, expectedText: string) {
	await expect(locator).toBeVisible();
	await expect(locator).toContainText(expectedText);
}

export async function expectInputValue(locator: Locator, expectedValue: string) {
	await expect(locator).toBeVisible();
	await expect(locator).toHaveValue(expectedValue);
}

export async function expectElementExists(page: Page, selector: string) {
	const element = page.locator(selector);
	await expect(element).toHaveCount(1);
}

export async function expectElementNotExists(page: Page, selector: string) {
	const element = page.locator(selector);
	await expect(element).toHaveCount(0);
}

export async function expectPageLoaded(page: Page) {
	await page.waitForLoadState('networkidle');
	await expect(page.getByTestId('loading')).not.toBeVisible();
}

export async function expectErrorMessage(page: Page, expectedError?: string) {
	const errorElement = page.locator('[data-testid="error"], .error-message, .alert-error');
	await expect(errorElement).toBeVisible();

	if (expectedError) {
		await expect(errorElement).toContainText(expectedError);
	}
}

export async function expectSuccessMessage(page: Page, expectedMessage?: string) {
	const successElement = page.locator('[data-testid="success"], .success-message, .alert-success');
	await expect(successElement).toBeVisible();

	if (expectedMessage) {
		await expect(successElement).toContainText(expectedMessage);
	}
}

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

export async function expectModalOpen(page: Page, modalSelector?: string) {
	const modal = modalSelector
		? page.locator(modalSelector)
		: page.locator('[role="dialog"], .modal, [data-testid*="modal"]');

	await expect(modal).toBeVisible();
}

export async function expectModalClosed(page: Page, modalSelector?: string) {
	const modal = modalSelector
		? page.locator(modalSelector)
		: page.locator('[role="dialog"], .modal, [data-testid*="modal"]');

	await expect(modal).not.toBeVisible();
}

export async function expectDropdownOpen(locator: Locator) {
	await expect(locator).toBeVisible();
	await expect(locator).toHaveAttribute('aria-expanded', 'true');
}

export async function expectDropdownClosed(locator: Locator) {
	await expect(locator).toHaveAttribute('aria-expanded', 'false');
}

export async function expectButtonLoading(locator: Locator) {
	await expect(locator).toBeDisabled();

	const loadingIndicator = locator.locator('.loading, .spinner, [data-testid="loading"]');
	await expect(loadingIndicator).toBeVisible();
}

export async function expectButtonNotLoading(locator: Locator) {
	await expect(locator).toBeEnabled();

	const loadingIndicator = locator.locator('.loading, .spinner, [data-testid="loading"]');
	await expect(loadingIndicator).not.toBeVisible();
}

export async function expectListContains(listLocator: Locator, expectedItems: string[]) {
	for (const item of expectedItems) {
		const itemElement = listLocator.getByText(item);
		await expect(itemElement).toBeVisible();
	}
}

export async function expectListCount(listLocator: Locator, expectedCount: number) {
	await expect(listLocator).toHaveCount(expectedCount);
}

export async function expectBreadcrumbPath(page: Page, expectedPath: string[]) {
	const breadcrumbs = page.locator('[data-testid="breadcrumbs"] a, .breadcrumbs a');

	for (let i = 0; i < expectedPath.length; i++) {
		const breadcrumb = breadcrumbs.nth(i);
		await expect(breadcrumb).toContainText(expectedPath[i]);
	}
}

export async function expectSearchResults(page: Page, resultCount?: number) {
	const results = page.getByTestId('search-results').getByTestId('search-result');
	await expect(results.first()).toBeVisible();

	if (resultCount !== undefined) {
		await expect(results).toHaveCount(resultCount);
	}
}

export async function expectNoSearchResults(page: Page) {
	const noResults = page.locator('[data-testid="no-results"], .no-results');
	await expect(noResults).toBeVisible();
}

export async function expectImageLoaded(locator: Locator) {
	await expect(locator).toBeVisible();

	const hasLoaded = await locator.evaluate((img: HTMLImageElement) => {
		return img.complete && img.naturalWidth > 0;
	});

	expect(hasLoaded).toBe(true);
}

export async function expectTableRowCount(tableLocator: Locator, expectedCount: number) {
	const rows = tableLocator.locator('tbody tr, tr:not(:first-child)');
	await expect(rows).toHaveCount(expectedCount);
}

export async function expectCodeBlock(page: Page, expectedCode: string) {
	const codeBlock = page.locator('pre code, .code-block code');
	await expect(codeBlock).toContainText(expectedCode);
}

export async function expectMarkdownRendered(contentLocator: Locator) {
	await expect(contentLocator).not.toContainText('# ');
	await expect(contentLocator).not.toContainText('## ');
	await expect(contentLocator).not.toContainText('**');
	await expect(contentLocator).not.toContainText('```');

	const headings = contentLocator.locator('h1, h2, h3, h4, h5, h6');
	const hasHeadings = (await headings.count()) > 0;

	if (hasHeadings) {
		await expect(headings.first()).toBeVisible();
	}
}

export async function expectCopySuccess(page: Page) {
	const copyFeedback = page.locator('[data-testid="copy-success"], .copy-success');
	await expect(copyFeedback).toBeVisible();

	await expect(copyFeedback).not.toBeVisible({ timeout: 5000 });
}

export async function expectAutoSaved(page: Page) {
	const autoSaveIndicator = page.locator('[data-testid="auto-saved"], .auto-saved');
	await expect(autoSaveIndicator).toBeVisible();
}

export async function expectUnsavedChanges(page: Page) {
	const unsavedIndicator = page.locator('[data-testid="unsaved-changes"], .unsaved-changes');
	await expect(unsavedIndicator).toBeVisible();
}

export async function expectTheme(page: Page, theme: 'light' | 'dark') {
	const body = page.locator('body');

	if (theme === 'dark') {
		await expect(body).toHaveClass(/dark/);
	} else {
		await expect(body).not.toHaveClass(/dark/);
	}
}

export async function expectNetworkRequest(page: Page, urlPattern: string | RegExp) {
	const responsePromise = page.waitForResponse(urlPattern);
	// The actual request should be triggered by the calling code
	const response = await responsePromise;
	expect(response.ok()).toBe(true);
}

export async function expectFileUploadSuccess(page: Page, fileName?: string) {
	const uploadSuccess = page.locator('[data-testid="upload-success"], .upload-success');
	await expect(uploadSuccess).toBeVisible();

	if (fileName) {
		await expect(uploadSuccess).toContainText(fileName);
	}
}

export async function expectAccessibilityAttributes(locator: Locator) {
	// Check for common accessibility attributes
	const role = await locator.getAttribute('role');
	const ariaLabel = await locator.getAttribute('aria-label');
	const ariaLabelledBy = await locator.getAttribute('aria-labelledby');

	expect(role || ariaLabel || ariaLabelledBy).toBeTruthy();
}

export async function expectKeyboardNavigation(page: Page, elements: Locator[]) {
	for (let i = 0; i < elements.length; i++) {
		await page.keyboard.press('Tab');
		await expect(elements[i]).toBeFocused();
	}
}
