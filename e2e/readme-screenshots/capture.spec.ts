import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEMO_DOCUMENTS, DEMO_EDITS } from './demo-wiki';

// Output: docs/screenshots/<name>-<theme>.png at the repo root. On main, CI
// publishes these to the `screenshots` branch and the README links them there.
const OUT = resolve(__dirname, '../../docs/screenshots');
const THEMES = ['light', 'dark'] as const;
type Theme = (typeof THEMES)[number];

async function seed(request: APIRequestContext) {
	for (const doc of DEMO_DOCUMENTS) {
		const res = await request.post('/api/documents', {
			data: {
				metaData: { title: doc.title, path: doc.path, tags: doc.tags },
				content: doc.content
			}
		});
		// 409 = already seeded by an earlier attempt of this run.
		expect(res.ok() || res.status() === 409, `create ${doc.path}: ${res.status()}`).toBeTruthy();
	}
	// A few saves on top so the version history has something to show. Send the
	// stored metadata back like the editor does, so created/updated stay intact.
	for (const edit of DEMO_EDITS) {
		const current = await request.get(`/api/documents${edit.path}`);
		expect(current.ok(), `get ${edit.path}: ${current.status()}`).toBeTruthy();
		const { metaData } = await current.json();
		const res = await request.put(`/api/documents${edit.path}`, {
			data: { metaData, content: edit.content }
		});
		expect(res.ok(), `update ${edit.path}: ${res.status()}`).toBeTruthy();
	}
}

async function useTheme(page: Page, theme: Theme) {
	await page.emulateMedia({ colorScheme: theme });
	await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
}

async function shot(page: Page, name: string, theme: Theme) {
	// Fonts and the markdown render settle a beat after the load signal.
	await page.evaluate(() => document.fonts.ready);
	await page.waitForTimeout(500);
	await page.screenshot({ path: `${OUT}/${name}-${theme}.png` });
}

test.beforeAll(async ({ request }) => {
	mkdirSync(OUT, { recursive: true });
	await seed(request);
});

for (const theme of THEMES) {
	test(`capture README screenshots (${theme})`, async ({ page }) => {
		await useTheme(page, theme);

		// Document view: rendered markdown with wiki links, a table and code.
		await page.goto('/documents/guides/getting-started');
		await expect(page.getByTestId('document-content')).toContainText('Welcome to the team wiki');
		await expect(page.getByTestId('folder-tree')).toBeVisible();
		await shot(page, 'document', theme);

		// Editor: CodeMirror with the live preview beside it.
		await page.goto('/edit/projects/website-relaunch');
		await expect(page.getByTestId('markdown-preview')).toContainText('Website relaunch');
		await shot(page, 'editor', theme);

		// Quick switcher (Ctrl/Cmd + K) over the home page.
		await page.goto('/');
		await expect(page.getByTestId('sidebar')).toBeVisible();
		await page.getByTestId('quick-switcher-button').click();
		await page.getByTestId('quick-switcher-input').fill('meet');
		await expect(page.getByTestId('quick-switcher-result').first()).toBeVisible();
		await shot(page, 'quick-switcher', theme);
		await page.keyboard.press('Escape');

		// Version history of a document that has been saved a few times.
		await page.goto('/documents/projects/website-relaunch');
		await expect(page.getByTestId('document-content')).toBeVisible();
		await page
			.getByRole('button', { name: /version/i })
			.first()
			.click();
		await expect(page.getByRole('dialog')).toBeVisible();
		await shot(page, 'version-history', theme);
	});
}
