import { test, expect } from '../fixtures';

// Home: pinned pages and the Recent list. Each test uses its own page
// (unique per test id), so runs on a shared backend don't collide; a test
// that pins unpins again.

test.describe('Home page', () => {
	test('lists a page you opened under Recent', async ({ page, withTestDocument }) => {
		await page.goto(`/documents${withTestDocument.path}`);
		await expect(page.getByRole('heading', { level: 1 })).toContainText(withTestDocument.title);

		await page.getByTestId('nav-logo').click();
		await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();

		const row = page.getByTestId('recent-row').filter({ hasText: withTestDocument.title });
		await expect(row).toBeVisible();
		await expect(row).toContainText(/just now|min ago/);
	});

	test('shows a newly changed page on the Changed tab', async ({ page, withTestDocument }) => {
		await page.goto('/');
		await page.getByRole('tab', { name: 'Changed' }).click();

		await expect(
			page.getByTestId('recent-row').filter({ hasText: withTestDocument.title })
		).toBeVisible();
	});

	test('pins a page from its menu and unpins it from Home', async ({ page, withTestDocument }) => {
		await page.goto(`/documents${withTestDocument.path}`);
		await expect(page.getByRole('heading', { level: 1 })).toContainText(withTestDocument.title);

		await page.getByTestId('document-actions-menu').click();
		await page.getByTestId('pin-document-menu-item').click();

		// The sidebar's Pinned group picks it up.
		await expect(
			page.getByTestId('sidebar-pinned-link').filter({ hasText: withTestDocument.title })
		).toBeVisible();

		await page.getByTestId('nav-logo').click();
		const tile = page.getByTestId('pinned-tile').filter({ hasText: withTestDocument.title });
		await expect(tile).toBeVisible();
		await expect(tile).toHaveAttribute('href', `/documents${withTestDocument.path}`);

		// Unpin from its Recent row.
		const row = page.getByTestId('recent-row').filter({ hasText: withTestDocument.title });
		await row.getByRole('button', { name: `Unpin ${withTestDocument.title}` }).click();
		await expect(tile).toHaveCount(0);
		await expect(
			page.getByTestId('sidebar-pinned-link').filter({ hasText: withTestDocument.title })
		).toHaveCount(0);
	});

	test('links to the full folder view', async ({ page }) => {
		await page.goto('/');
		await page.getByRole('link', { name: 'Browse all' }).click();
		await expect(page).toHaveURL(/\/folders$/);
	});

	test('the old Recent page redirects to Home', async ({ page }) => {
		await page.goto('/recent');
		await expect(page).toHaveURL(/\/$/);
		await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
	});
});
