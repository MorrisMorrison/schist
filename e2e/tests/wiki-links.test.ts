import { test, expect } from '../fixtures';

/**
 * Wiki links between pages: [[Title]] finds the page, the page lists who links
 * to it, and a link to a page that doesn't exist is marked broken and inert.
 */
test.describe('Wiki links', () => {
	test('a link opens its page, which lists the linking page as a backlink', async ({
		apiHelper,
		documentViewPage,
		testId,
		page
	}) => {
		const target = await apiHelper.seedDocument({
			title: `Target ${testId}`,
			path: `/target-${testId}`,
			content: '# Target\n\nThe page being linked to.'
		});
		const source = await apiHelper.seedDocument({
			title: `Source ${testId}`,
			path: `/source-${testId}`,
			content: `# Source\n\nSee [[Target ${testId}]] for details.`
		});

		await documentViewPage.openDocument(source);
		const link = documentViewPage.documentContent.locator('.wiki-link', {
			hasText: `Target ${testId}`
		});
		await expect(link).toBeVisible();
		await expect(link).not.toHaveClass(/broken-link/);

		await link.click();
		await expect(page).toHaveURL(new RegExp(`/documents${target.path}$`));
		await documentViewPage.verifyDocumentLoaded(target.title);

		// The Links section (list view) names the page that links here.
		await page.getByRole('button', { name: 'List', exact: true }).click();
		await expect(page.getByRole('heading', { name: 'Backlinks (1)' })).toBeVisible();
		const backlink = page.getByRole('button', {
			name: `Navigate to document: ${source.title}`
		});
		await expect(backlink).toBeVisible();

		await backlink.click();
		await expect(page).toHaveURL(new RegExp(`/documents${source.path}$`));
		await documentViewPage.verifyDocumentLoaded(source.title);
	});

	test('a link to a missing page is marked broken and goes nowhere', async ({
		apiHelper,
		documentViewPage,
		testId,
		page
	}) => {
		const source = await apiHelper.seedDocument({
			title: `Links out ${testId}`,
			path: `/links-out-${testId}`,
			content: `# Links out\n\nStill to write: [[Missing ${testId}]].`
		});

		await documentViewPage.openDocument(source);
		const link = documentViewPage.documentContent.locator('.wiki-link', {
			hasText: `Missing ${testId}`
		});
		await expect(link).toHaveClass(/broken-link/);
		await expect(link).toHaveAttribute('title', `Document "Missing ${testId}" does not exist`);

		// A broken link is inert: clicking it leaves the reader where they are.
		await link.click();
		await expect(page).toHaveURL(new RegExp(`/documents${source.path}$`));
		await expect(documentViewPage.documentTitle).toHaveText(source.title);
	});
});
