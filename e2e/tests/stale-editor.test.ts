import { test, expect } from '../fixtures';

test.describe('Stale editor', () => {
	test('a save after the page changed elsewhere asks before overwriting', async ({
		apiHelper,
		documentViewPage,
		editorPage,
		page,
		testId
	}) => {
		const doc = await apiHelper.seedDocument({
			title: `Stale ${testId}`,
			path: `/stale-${testId}`,
			content: `# Stale ${testId}\n\nOriginal.`
		});
		await documentViewPage.openDocument(doc);
		await documentViewPage.editDocument();

		// Someone else saves the page meanwhile (no baseVersion: always accepted).
		const changed = await apiHelper.request('PUT', `/documents${doc.path}`, {
			metaData: { title: doc.title, path: doc.path },
			content: `# Stale ${testId}\n\nChanged elsewhere.`,
			saveType: 'manual'
		});
		expect(changed.status).toBe(200);

		await editorPage.typeContent('\n\nMy edit.');
		await page.keyboard.press('Control+s');

		const dialog = page.getByTestId('stale-document-dialog');
		await expect(dialog).toBeVisible();
		const stored = await apiHelper.getDocument(doc.path!);
		expect(stored.data?.content).toContain('Changed elsewhere.');
		expect(stored.data?.content).not.toContain('My edit.');

		await dialog.getByRole('button', { name: 'Keep mine' }).click();
		await expect(dialog).toBeHidden();
		await expect
			.poll(async () => (await apiHelper.getDocument(doc.path!)).data?.content)
			.toContain('My edit.');
	});
});
