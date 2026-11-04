/// <reference types="node" />

import { readFileSync } from 'fs';
import { join } from 'path';
import { test, expect } from '../fixtures';
import { ImportDialog } from '../pages/ImportDialog';
import type { ImportResultData } from '../utils/api-helpers';
import { createZip, filesUnder, listZip } from '../utils/zip';

// An Obsidian-style folder: nested folders, front matter (with custom keys),
// a callout, a Dataview block, links between the notes (alias, heading), a
// link to a note outside the import, a picture and Obsidian's settings folder.
const VAULT = join(__dirname, '..', 'fixtures', 'import', 'vault');
const vaultFiles = () => filesUnder(VAULT, 'vault');
const markdownFiles = () => vaultFiles().filter((file) => file.name.endsWith('.md'));
const zipOf = (files: { name: string; data: Buffer }[]) => ({
	name: 'vault.zip',
	mimeType: 'application/zip',
	buffer: createZip(files)
});

// Where each note lands (paths from the file name) and its title (front
// matter, else the first heading).
const NOTES = {
	'vault/devices/router.md': { path: 'vault/devices/router', title: 'router — main gateway' },
	'vault/devices/switch.md': { path: 'vault/devices/switch', title: 'Core switch' },
	'vault/notes/readme.md': { path: 'vault/notes/readme', title: 'Readme' }
} as const;

/** Every test imports into its own new top-level folder (runs are sharded). */
const targetFor = (testId: string) => `imp-${testId}`;

function imported(result: ImportResultData) {
	return Object.fromEntries(result.success.map((doc) => [doc.original_name, doc]));
}

function expectNotesAt(result: ImportResultData, target: string, suffix = '') {
	const byName = imported(result);
	for (const [file, note] of Object.entries(NOTES)) {
		expect(byName[file]?.final_path, file).toBe(`/${target}/${note.path}${suffix}`);
		expect(byName[file]?.title, file).toBe(note.title);
	}
}

test.describe('Import and export', () => {
	test('imports a folder into a new folder from the sidebar Import button', async ({
		folderPage,
		documentViewPage,
		page,
		testId
	}) => {
		const target = targetFor(testId);
		await folderPage.navigateToRoot();

		const dialog = new ImportDialog(page);
		await dialog.openFromSidebarButton();
		await dialog.chooseFolder(VAULT);
		// Only the markdown files are sent; the picture and the settings are left out.
		await expect(dialog.leftOut).toContainText('other files');
		await dialog.setTarget(`/${target}`);
		await expect(dialog.targetHint).toContainText(
			`New folder: /${target} is created by the import.`
		);

		const result = await dialog.submit();
		expect(result.failed).toEqual([]);
		expect(result.imported_count).toBe(3);
		expectNotesAt(result, target);

		const byName = imported(result);
		expect(byName['vault/devices/router.md'].notes).toEqual(
			expect.arrayContaining([
				'1 × converted callout',
				'1 × link not found in this import or the wiki (kept by name)'
			])
		);
		expect(byName['vault/devices/switch.md'].notes).toContain('1 × removed Dataview query');
		await dialog.finish();

		// The tree shows the new folder without a reload, and the pages open.
		await folderPage.verifyContainsFolder(target);
		await documentViewPage.goto(`/documents/${target}/vault/devices/router`);
		await documentViewPage.waitForContentReady(documentViewPage.documentTitle);
		await expect(documentViewPage.documentTitle).toHaveText('router — main gateway');
		await expect(documentViewPage.documentContent).toContainText('Ports');
	});

	test('links between imported notes resolve; the outside link stays unresolved', async ({
		apiHelper,
		documentViewPage,
		page,
		testId
	}) => {
		const target = targetFor(testId);
		await apiHelper.importFiles(vaultFiles(), { targetPath: `/${target}` });

		await documentViewPage.goto(`/documents/${target}/vault/devices/router`);
		await documentViewPage.waitForContentReady(documentViewPage.documentContent);
		const content = documentViewPage.documentContent;
		await expect(content.locator('.broken-link', { hasText: 'outside-note' })).toBeVisible();
		await expect(
			content.locator('.wiki-link:not(.broken-link)', { hasText: 'switch › VLANs' })
		).toBeVisible();

		await content.locator('.wiki-link', { hasText: 'the switch' }).click();
		await expect(page).toHaveURL(new RegExp(`/documents/${target}/vault/devices/switch$`));
		await documentViewPage.waitForContentReady(documentViewPage.documentTitle);
		await expect(documentViewPage.documentTitle).toHaveText('Core switch');

		// The target lists the router among its links (the router links here).
		const links = page.locator('section', { has: page.getByRole('heading', { name: 'Links' }) });
		await expect(links).toContainText('router — main gateway');
	});

	test('keeps tags and custom front matter', async ({
		apiHelper,
		documentViewPage,
		folderPage,
		page,
		testId
	}) => {
		const target = targetFor(testId);
		await apiHelper.importFiles(vaultFiles(), { targetPath: `/${target}` });

		await documentViewPage.goto(`/documents/${target}/vault/devices/router`);
		await documentViewPage.waitForContentReady(documentViewPage.documentTitle);
		await expect(documentViewPage.documentTags.filter({ hasText: 'e2e-import' })).toBeVisible();
		await expect(documentViewPage.documentTags.filter({ hasText: 'network' })).toBeVisible();

		await folderPage.treeFilter.fill('tag:e2e-import');
		// The filter keeps the folders around a match but leaves them collapsed.
		await page.getByTitle('Expand all folders').click();
		await expect(folderPage.folderTree.getByText('router — main gateway')).toBeVisible();
		await expect(folderPage.folderTree.getByText('Core switch')).toHaveCount(0);

		// Keys Schist doesn't know survive as properties.
		const router = await apiHelper.getDocument(`/${target}/vault/devices/router`);
		expect(router.data?.metaData.properties).toEqual({ status: 'active', role: 'gateway' });
	});

	test('a zip from the + menu gives the same pages as the folder', async ({
		folderPage,
		page,
		testId
	}) => {
		const target = targetFor(testId);
		await folderPage.navigateToRoot();

		const dialog = new ImportDialog(page);
		await dialog.openFromNewMenu();
		await dialog.chooseFiles([zipOf(vaultFiles())]);
		await dialog.setTarget(`/${target}`);
		const result = await dialog.submit();

		expect(result.failed).toEqual([]);
		expect(result.imported_count).toBe(3);
		expectNotesAt(result, target);
		// In a zip the picture and the settings folder arrive too, and are skipped.
		expect(result.skipped.map((doc) => doc.notes)).toEqual(
			expect.arrayContaining([['not a markdown file'], ['skipped folder .obsidian']])
		);
		await dialog.finish();
		await folderPage.verifyContainsFolder(target);
	});

	test('a second import skips, renames or overwrites as chosen', async ({
		apiHelper,
		folderPage,
		page,
		testId
	}) => {
		const target = targetFor(testId);
		await apiHelper.importFiles(markdownFiles(), { targetPath: `/${target}` });
		await folderPage.navigateToRoot();
		const dialog = new ImportDialog(page);

		const importAgain = async (mode: 'Skip' | 'Rename' | 'Overwrite') => {
			await dialog.openFromNewMenu();
			await dialog.chooseFiles([zipOf(markdownFiles())]);
			await dialog.setTarget(`/${target}`);
			await dialog.chooseConflictMode(mode);
			const result = await dialog.submit();
			await dialog.finish();
			expect(result.failed).toEqual([]);
			return result;
		};

		const skipped = await importAgain('Skip');
		expect(skipped.imported_count).toBe(0);
		expect(skipped.skipped_count).toBe(3);
		for (const doc of skipped.skipped) {
			expect(doc.notes).toContain('a document already exists here');
		}

		const renamed = await importAgain('Rename');
		expect(renamed.imported_count).toBe(3);
		expectNotesAt(renamed, target, '-1');

		const original = await apiHelper.getDocument(`/${target}/vault/notes/readme`);
		const overwritten = await importAgain('Overwrite');
		expect(overwritten.imported_count).toBe(3);
		expectNotesAt(overwritten, target);
		const after = await apiHelper.getDocument(`/${target}/vault/notes/readme`);
		// The renamed copy (router-1) shares the router's title, so the link is now
		// written by path to the router it means (#333); otherwise it's unchanged.
		expect(after.data?.content).toBe(
			original.data?.content?.replace(
				'[[router — main gateway]]',
				`[[/${target}/vault/devices/router|router — main gateway]]`
			)
		);
		// Overwriting doesn't add pages: three originals plus the three renamed copies.
		const folder = await apiHelper.getFolder(`/${target}/vault/devices`);
		expect(JSON.stringify(folder.data)).not.toContain('router-2');
	});

	test("a folder's Import here opens the dialog at that folder", async ({
		apiHelper,
		folderPage,
		page,
		testId
	}) => {
		const target = targetFor(testId);
		await apiHelper.importFiles(
			[{ name: 'readme.md', data: readFileSync(join(VAULT, 'notes', 'readme.md')) }],
			{ targetPath: `/${target}` }
		);
		await folderPage.navigateToRoot();

		const menu = await folderPage.openContextMenu(target);
		await menu.getByRole('menuitem', { name: 'Import here' }).click();
		const dialog = new ImportDialog(page);
		await expect(dialog.dialog).toBeVisible();
		await expect(dialog.targetInput).toHaveValue(`/${target}`);

		await dialog.chooseFiles([
			{ name: 'extra.md', mimeType: 'text/markdown', buffer: Buffer.from('# Extra\n\nAdded here.') }
		]);
		const result = await dialog.submit();
		expect(result.success.map((doc) => doc.final_path)).toEqual([`/${target}/extra`]);
		await dialog.finish();
	});

	test('exports an imported folder as a zip of its pages', async ({
		apiHelper,
		folderPage,
		page,
		testId
	}) => {
		const target = targetFor(testId);
		await apiHelper.importFiles(vaultFiles(), { targetPath: `/${target}` });
		await folderPage.navigateToRoot();

		const menu = await folderPage.openContextMenu(target);
		const download = page.waitForEvent('download');
		await menu.getByRole('menuitem', { name: 'Export' }).click();
		const file = await download;
		expect(file.suggestedFilename()).toBe(`${target}.zip`);

		const path = await file.path();
		expect(listZip(readFileSync(path)).sort()).toEqual([
			'vault/devices/Core switch.md',
			'vault/devices/router — main gateway.md',
			'vault/notes/Readme.md'
		]);
	});
});
