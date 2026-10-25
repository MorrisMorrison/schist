import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEMO_DOCUMENTS } from './demo-wiki';

// PROTOTYPE (#246): screenshots of the single-pane read/edit toggle. Run with
//   SCHIST_BIN=<binary> npx playwright test -c playwright.screenshots.config.ts editor-proto
const OUT = resolve(__dirname, '../../docs/screenshots/editor-proto');
const THEMES = ['light', 'dark'] as const;
const DOC = '/documents/guides/getting-started';

async function shot(page: Page, name: string, clip?: { x: number; y: number; width: number; height: number }) {
	await page.evaluate(() => document.fonts.ready);
	await page.waitForTimeout(500);
	await page.screenshot({ path: `${OUT}/${name}.png`, clip });
}

test.beforeAll(async ({ request }) => {
	mkdirSync(OUT, { recursive: true });
	for (const doc of DEMO_DOCUMENTS) {
		const res = await request.post('/api/documents', {
			data: { metaData: { title: doc.title, path: doc.path, tags: doc.tags }, content: doc.content }
		});
		expect(res.ok() || res.status() === 409).toBeTruthy();
	}
});

for (const theme of THEMES) {
	test(`editor prototype (${theme})`, async ({ page }) => {
		await page.emulateMedia({ colorScheme: theme });
		await page.addInitScript((t) => localStorage.setItem('theme', t), theme);

		// Reading view.
		await page.goto(DOC);
		await expect(page.getByTestId('document-content')).toContainText('Welcome to the team wiki');
		await shot(page, `read-${theme}`);
		await page.getByText('Pages can hold code too').scrollIntoViewIfNeeded();
		await shot(page, `read-lower-${theme}`);
		await page.evaluate(() => window.scrollTo(0, 0));
		await page.locator('main, [data-testid="document-view"]').first().evaluate((el) => {
			for (let n: HTMLElement | null = el; n; n = n.parentElement) n.scrollTop = 0;
		});
		const header = await page.locator('[data-testid="document-view"] header').boundingBox();
		const toggleClip = header && {
			x: header.x + header.width - 380,
			y: header.y - 8,
			width: 396,
			height: 56
		};
		if (toggleClip) await shot(page, `toggle-read-${theme}`, toggleClip);

		// Ctrl+E: same page, same column, now editable (live preview).
		await page.keyboard.press('Control+e');
		await expect(page).toHaveURL(/mode=edit/);
		const editor = page.locator('.prose-editor .cm-content');
		await expect(editor).toContainText('Welcome to the team wiki');
		// Cursor inside a wiki link: only that element shows its [[ ]] syntax.
		await page.locator('.cm-lp-wikilink', { hasText: 'Writing style' }).click();
		await shot(page, `edit-live-${theme}`);
		if (toggleClip) await shot(page, `toggle-edit-${theme}`, toggleClip);
		// Lower half, cursor in the list: that line shows its `- ` and backticks.
		await page.locator('.cm-line', { hasText: 'saves' }).last().click();
		await page.locator('.cm-line', { hasText: 'return' }).scrollIntoViewIfNeeded();
		await shot(page, `edit-live-lower-${theme}`);

		// Phase 1+2 look: source editing, prose-styled, all syntax visible.
		await page.getByTestId('live-preview-toggle').uncheck();
		await page.locator('.cm-line', { hasText: 'Welcome to the team wiki' }).click();
		await shot(page, `edit-source-${theme}`);
		await page.getByTestId('live-preview-toggle').check();

		// Typing works and Ctrl+E goes back to reading with the change saved.
		await page.locator('.cm-line', { hasText: 'Welcome to the team wiki' }).click();
		await page.keyboard.press('End');
		await page.keyboard.type(' Edited in place.');
		await expect(page.getByTestId('unsaved-indicator')).toBeVisible();
		await page.keyboard.press('Control+e');
		await expect(page).not.toHaveURL(/mode=edit/);
		await expect(page.getByTestId('document-content')).toContainText('Edited in place.');
		const saved = await page.request.get('/api/documents/guides/getting-started');
		expect((await saved.json()).content).toContain('Edited in place.');

		// Undo the edit so the second theme starts from the same text.
		await page.keyboard.press('Control+e');
		await page.locator('.cm-line', { hasText: 'Edited in place.' }).click();
		await page.keyboard.press('Control+z');
		await page.keyboard.press('Control+e');
		await expect(page.getByTestId('document-content')).not.toContainText('Edited in place.');

		if (theme === 'light') {
			await page.setViewportSize({ width: 390, height: 844 });
			await page.goto(`${DOC}?mode=edit`);
			await expect(editor).toContainText('Welcome to the team wiki');
			await shot(page, `edit-live-mobile-${theme}`);
		}
	});
}
