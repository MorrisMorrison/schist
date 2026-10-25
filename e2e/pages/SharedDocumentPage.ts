import { type Page, type Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';
import { DocumentViewPage } from './DocumentViewPage';

/**
 * Page object for viewing shared documents (/share/[token])
 * These pages are public and don't require authentication
 */
/** The token of a share link (`…/share/<64 hex chars>`), asserting its format. */
export function shareToken(shareUrl: string): string {
	const token = shareUrl.split('/share/')[1];
	expect(token).toMatch(/^[a-f0-9]{64}$/);
	return token;
}

export class SharedDocumentPage extends BasePage {
	// Header elements
	readonly header: Locator;
	readonly brandingText: Locator;
	readonly poweredByText: Locator;

	// Document content
	readonly documentTitle: Locator;
	readonly documentContent: Locator;

	// Footer elements
	readonly footer: Locator;
	readonly documentPathDisplay: Locator;

	// Error states
	readonly notFoundMessage: Locator;
	readonly loadingMessage: Locator;

	constructor(page: Page) {
		super(page);

		// Header elements
		this.header = page.locator('header');
		this.brandingText = page.getByText('Shared Document (Read-only)');
		this.poweredByText = page.getByText('Powered by Schist');

		// Document content. The share page's title <h1> has no test id yet.
		this.documentTitle = page.locator('h1').first();
		this.documentContent = page.getByTestId('shared-document-content');

		// Footer elements
		this.footer = page.locator('footer');
		this.documentPathDisplay = page.locator('code');

		// Error states
		this.notFoundMessage = page.getByText(/page not found/i);
		this.loadingMessage = page.getByText(/loading content/i);
	}

	/**
	 * Navigate to a shared document using its token
	 */
	async navigateToSharedDocument(token: string) {
		await this.goto(`/share/${token}`);
		await this.waitForLoad();
	}

	/**
	 * Open a share link the app handed out. Navigates by token rather than the
	 * absolute URL: its origin is the server's configured frontend URL, which
	 * need not be the address the tests reach it on.
	 */
	async navigateToShareUrl(shareUrl: string) {
		await this.navigateToSharedDocument(shareToken(shareUrl));
	}

	/**
	 * Verify the shared document is loaded and displays content
	 */
	async verifySharedDocumentLoaded(expectedTitle?: string) {
		await this.waitForContentReady(this.documentTitle);
		await expect(this.loadingMessage).toBeHidden();

		if (expectedTitle) {
			await expect(this.documentTitle).toHaveText(expectedTitle);
		}

		// Verify header elements
		await expect(this.brandingText).toBeVisible();
		await expect(this.poweredByText).toBeVisible();

		// Verify footer elements
		await expect(this.footer).toBeVisible();
	}

	/**
	 * Verify the header shows the document's creation date. ("Updated" is only
	 * shown once it differs from "Created", so it is not asserted.)
	 */
	async verifyMetadata() {
		await expect(this.header.getByText(/^Created /)).toBeVisible();
	}

	/**
	 * Verify the document path is displayed in footer
	 */
	async verifyDocumentPath(expectedPath: string) {
		await expect(this.documentPathDisplay).toContainText(expectedPath);
	}

	/**
	 * Verify shared document is not found (404)
	 */
	async verifyNotFound() {
		await expect(this.notFoundMessage).toBeVisible();
	}

	/**
	 * Verify no authentication elements are present
	 * (This confirms it's truly a public page)
	 */
	async verifyNoAuthenticationRequired() {
		// Check that there are no login buttons, user menus, etc.
		const loginButton = this.page.getByRole('button', { name: /login|sign in/i });
		const userMenu = this.page.getByTestId('user-menu');
		const authRequired = this.page.getByText(/authentication required/i);

		await expect(loginButton).not.toBeVisible();
		await expect(userMenu).not.toBeVisible();
		await expect(authRequired).not.toBeVisible();
	}

	/**
	 * Verify the page title includes "Shared Document"
	 */
	async verifyPageTitle(expectedDocumentTitle?: string) {
		await expect(this.page).toHaveTitle(/Shared Document/);

		if (expectedDocumentTitle) {
			expect(await this.page.title()).toContain(expectedDocumentTitle);
		}
	}

	/**
	 * Verify that edit/share/delete actions are NOT available
	 * (This confirms the document is truly read-only)
	 */
	async verifyReadOnlyMode() {
		const documentPage = new DocumentViewPage(this.page);

		await expect(documentPage.editButton).not.toBeVisible();
		await expect(documentPage.shareButton).not.toBeVisible();
		await expect(documentPage.deleteButton).not.toBeVisible();
	}

	/**
	 * Verify the shared document has a clean, minimal layout
	 * without the main app navigation/sidebar
	 */
	async verifyMinimalLayout() {
		// Check that main app navigation elements are not present
		const sidebar = this.page.getByTestId('sidebar');
		const mainNav = this.page.getByTestId('main-navigation');
		const { breadcrumbs } = new DocumentViewPage(this.page);

		await expect(sidebar).not.toBeVisible();
		await expect(mainNav).not.toBeVisible();
		await expect(breadcrumbs).not.toBeVisible();

		// But header and footer should be present
		await expect(this.header).toBeVisible();
		await expect(this.footer).toBeVisible();
	}
}
