import { test, expect } from '../fixtures';

// The folder view lists a folder's subfolders, then its pages; "Include
// subfolders" lists every page below it with its sub-path. Each test works in
// its own folder (unique per test id).

test.describe('Folder view', () => {
	test('lists subfolders first, then pages, and flattens with Include subfolders', async ({
		page,
		apiHelper,
		testId
	}) => {
		const folder = `fv-${testId}`;
		await apiHelper.seedDocument({ title: `Top ${testId}`, path: `/${folder}/top` });
		await apiHelper.seedDocument({ title: `Nested ${testId}`, path: `/${folder}/inner/nested` });

		await page.goto(`/folders/${folder}`);

		const subfolder = page.getByTestId('folder-subfolder-row');
		await expect(subfolder).toHaveCount(1);
		await expect(subfolder).toContainText('inner');
		const rows = page.getByTestId('folder-page-row');
		await expect(rows).toHaveCount(1);
		await expect(rows.first()).toContainText(`Top ${testId}`);
		await expect(page.getByTestId('folder-counts')).toHaveText('1 page · 1 folder');

		await page.getByRole('switch', { name: 'Include subfolders' }).click();
		await expect(subfolder).toHaveCount(0);
		await expect(rows).toHaveCount(2);
		const nested = rows.filter({ hasText: `Nested ${testId}` });
		await expect(nested).toContainText('inner');

		await nested.getByRole('link', { name: new RegExp(`Nested ${testId}`) }).click();
		await expect(page).toHaveURL(new RegExp(`/documents/${folder}/inner/nested$`));
	});

	test('opens a subfolder from its row', async ({ page, apiHelper, testId }) => {
		const folder = `fv-${testId}`;
		await apiHelper.seedDocument({ title: `Deep ${testId}`, path: `/${folder}/sub/deep` });

		await page.goto(`/folders/${folder}`);
		await page.getByTestId('folder-subfolder-row').getByRole('link', { name: 'sub' }).click();

		await expect(page).toHaveURL(new RegExp(`/folders/${folder}/sub$`));
		await expect(page.getByTestId('folder-page-row')).toContainText(`Deep ${testId}`);
	});
});
