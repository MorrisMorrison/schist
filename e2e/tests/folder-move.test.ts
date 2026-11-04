import { test, expect } from '../fixtures';

/**
 * Dragging a folder onto another in the tree moves it with everything in it:
 * the pages answer at their new paths, the old paths are gone, and wiki links
 * to them (by title) still resolve.
 */
test.describe('Folder move', () => {
	test('drags a folder with pages into another folder', async ({
		apiHelper,
		folderPage,
		documentViewPage,
		testId,
		page
	}) => {
		const source = `move-src-${testId}`;
		const target = `move-dst-${testId}`;
		const inner = await apiHelper.seedDocument({
			title: `Inside ${testId}`,
			path: `/${source}/inside-${testId}`,
			content: '# Inside\n\nTravels with its folder.'
		});
		const deeper = await apiHelper.seedDocument({
			title: `Deeper ${testId}`,
			path: `/${source}/sub/deeper-${testId}`,
			content: '# Deeper\n\nIn a subfolder of the moved folder.'
		});
		await apiHelper.seedDocument({
			title: `Already there ${testId}`,
			path: `/${target}/already-${testId}`
		});
		const linker = await apiHelper.seedDocument({
			title: `Linker ${testId}`,
			path: `/linker-${testId}`,
			content: `# Linker\n\nSee [[Inside ${testId}]].`
		});

		await folderPage.navigateToRoot();
		const sourceItem = folderPage.folderTree.getByText(source, { exact: true });
		const targetItem = folderPage.folderTree.getByText(target, { exact: true });
		await expect(sourceItem).toBeVisible();
		await expect(targetItem).toBeVisible();

		const moved = page.waitForResponse(
			(response) =>
				response.request().method() === 'POST' &&
				new URL(response.url()).pathname.endsWith('/api/folders/move')
		);
		await sourceItem.dragTo(targetItem);
		expect((await moved).ok()).toBe(true);

		// Every page moved, subfolders included; the old paths are gone.
		for (const document of [inner, deeper]) {
			const newPath = `/${target}${document.path}`;
			expect((await apiHelper.getDocument(newPath)).status).toBe(200);
			expect((await apiHelper.getDocument(document.path!)).status).toBe(404);
		}

		// A link by title follows the page to its new place.
		await documentViewPage.openDocument(linker);
		const link = documentViewPage.documentContent.locator('.wiki-link', {
			hasText: `Inside ${testId}`
		});
		await expect(link).not.toHaveClass(/broken-link/);
		await link.click();
		await expect(page).toHaveURL(new RegExp(`/documents/${target}${inner.path}$`));
		await documentViewPage.verifyDocumentLoaded(inner.title);
	});
});
