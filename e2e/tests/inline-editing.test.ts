import { test, expect } from '../fixtures';
import type { ApiHelper } from '../utils/api-helpers';

async function storedContent(apiHelper: ApiHelper, path: string): Promise<string> {
	const res = await apiHelper.request('GET', `/documents${path}`);
	expect(res.status).toBe(200);
	return (res.data as { content: string }).content;
}

// Reading and editing are two modes of one page: the toggle (or Ctrl/Cmd+E)
// switches in place, saving on the way back to reading.
test.describe('In-place editing', () => {
	test('toggles read -> edit -> read without leaving the page and saves on the way back', async ({
		page,
		documentViewPage,
		editorPage,
		apiHelper,
		withSimpleTestDocument: testDocument
	}) => {
		await documentViewPage.openDocument(testDocument);
		// A full page load would drop this marker.
		await page.evaluate(() => ((window as unknown as { __noReload: boolean }).__noReload = true));

		await page.keyboard.press('Control+e');
		await expect(page).toHaveURL(new RegExp(`/documents${testDocument.path}\\?mode=edit$`));
		await expect(editorPage.contentEditor).toBeVisible();
		await expect(documentViewPage.documentContent).toHaveCount(0);

		await editorPage.appendContent('\n\nWritten in place.');
		await expect(editorPage.unsavedIndicator).toBeVisible();

		await page.keyboard.press('Control+e');
		await expect(documentViewPage.documentView).toHaveAttribute('data-mode', 'read');
		await expect(page).toHaveURL(new RegExp(`/documents${testDocument.path}$`));
		await documentViewPage.verifyContentContains('Written in place.');

		expect(await storedContent(apiHelper, testDocument.path!)).toContain('Written in place.');
		expect(
			await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)
		).toBe(true);
	});

	test('keeps the cursor across a round trip through the reading view', async ({
		page,
		documentViewPage,
		editorPage,
		withSimpleTestDocument: testDocument
	}) => {
		await documentViewPage.openDocument(testDocument);
		await documentViewPage.editDocument();
		await editorPage.contentEditor.click();
		// Just after "# " on the title line.
		await page.keyboard.press('Control+Home');
		await page.keyboard.press('ArrowRight');
		await page.keyboard.press('ArrowRight');

		await editorPage.readButton.click();
		await expect(documentViewPage.documentView).toHaveAttribute('data-mode', 'read');
		await documentViewPage.editButton.click();
		await expect(editorPage.contentEditor).toBeFocused();
		await page.keyboard.type('Kept ');

		await expect(editorPage.documentTitle).toHaveText(`# Kept ${testDocument.title}`);
	});

	test('the /edit/<path> deep link opens the document in edit mode', async ({
		page,
		documentViewPage,
		editorPage,
		withSimpleTestDocument: testDocument
	}) => {
		await editorPage.navigateToEdit(testDocument.path!);

		await expect(page).toHaveURL(new RegExp(`/documents${testDocument.path}\\?mode=edit$`));
		await expect(editorPage.documentTitle).toContainText(testDocument.title);
		await expect(documentViewPage.editButton).toHaveAttribute('aria-checked', 'true');
	});

	test('asks before leaving with unsaved changes; Discard keeps the stored text', async ({
		page,
		documentViewPage,
		editorPage,
		apiHelper,
		withSimpleTestDocument: testDocument
	}) => {
		await documentViewPage.openDocument(testDocument);
		await documentViewPage.editDocument();
		await editorPage.appendContent('\n\nNot meant to be kept.');
		// An in-app link, so SvelteKit's navigation guard (not beforeunload) runs.
		await page.getByRole('link', { name: 'Home' }).first().click();

		const dialog = page.getByTestId('unsaved-changes-dialog');
		await expect(dialog).toBeVisible();
		await page.getByTestId('discard-and-continue-button').click();
		await expect(page).toHaveURL(/\/$/);

		expect(await storedContent(apiHelper, testDocument.path!)).not.toContain(
			'Not meant to be kept.'
		);
	});
});
