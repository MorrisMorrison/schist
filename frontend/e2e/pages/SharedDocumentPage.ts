import { type Page, type Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Page object for viewing shared documents (/share/[token])
 * These pages are public and don't require authentication
 */
export class SharedDocumentPage extends BasePage {
	// Header elements
	readonly header: Locator;
	readonly brandingText: Locator;
	readonly poweredByText: Locator;

	// Document content
	readonly documentTitle: Locator;
	readonly documentContent: Locator;
	readonly documentTags: Locator;
	readonly documentMetadata: Locator;
	readonly createdDate: Locator;
	readonly updatedDate: Locator;

	// Footer elements
	readonly footer: Locator;
	readonly printButton: Locator;
	readonly githubLink: Locator;
	readonly documentPathDisplay: Locator;

	// Content elements
	readonly headings: Locator;
	readonly links: Locator;
	readonly images: Locator;
	readonly codeBlocks: Locator;

	// Error states
	readonly notFoundMessage: Locator;
	readonly expiredMessage: Locator;
	readonly loadingMessage: Locator;

	constructor(page: Page) {
		super(page);

		// Header elements
		this.header = page.locator('header');
		this.brandingText = page.getByText('📄 Shared Document');
		this.poweredByText = page.getByText('Powered by Schist');

		// Document content
		this.documentTitle = page.locator('h1').first();
		this.documentContent = page.locator('article.prose, .prose').first();
		this.documentTags = page
			.locator('[data-testid="document-tag"], .badge')
			.filter({ hasText: /.+/ });
		this.documentMetadata = page.locator('.text-muted-foreground').first();
		this.createdDate = page.getByText(/Created/);
		this.updatedDate = page.getByText(/Updated/);

		// Footer elements
		this.footer = page.locator('footer');
		this.printButton = page.getByRole('button', { name: /print/i });
		this.githubLink = page.getByRole('link', { name: /schist/i });
		this.documentPathDisplay = page.locator('code');

		// Content elements
		this.headings = this.documentContent.locator('h1, h2, h3, h4, h5, h6');
		this.links = this.documentContent.locator('a');
		this.images = this.documentContent.locator('img');
		this.codeBlocks = this.documentContent.locator('pre, code');

		// Error states
		this.notFoundMessage = page.getByText(/share not found/i);
		this.expiredMessage = page.getByText(/expired/i);
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
	 * Extract token from current URL
	 */
	getTokenFromUrl(): string {
		const url = this.page.url();
		const match = url.match(/\/share\/([^?#]+)/);
		return match ? match[1] : '';
	}

	/**
	 * Verify the shared document is loaded and displays content
	 */
	async verifySharedDocumentLoaded(expectedTitle?: string) {
		// Wait for loading to complete
		await this.page.waitForLoadState('networkidle');

		// Wait for loading messages to disappear
		if (await this.loadingMessage.isVisible()) {
			await this.loadingMessage.waitFor({ state: 'hidden', timeout: 10000 });
		}

		// Verify title is visible
		await expect(this.documentTitle).toBeVisible();

		if (expectedTitle) {
			await expect(this.documentTitle).toHaveText(expectedTitle);
		}

		// Verify header elements
		await expect(this.brandingText).toBeVisible();
		await expect(this.poweredByText).toBeVisible();

		// Verify footer elements
		await expect(this.footer).toBeVisible();
		await expect(this.printButton).toBeVisible();
	}

	/**
	 * Verify content contains specific text
	 */
	async verifyContentContains(text: string) {
		await expect(this.documentContent).toContainText(text);
	}

	/**
	 * Verify content contains specific heading
	 */
	async verifyHeading(headingText: string, level?: number) {
		if (level) {
			const heading = this.documentContent.locator(`h${level}`).getByText(headingText);
			await expect(heading).toBeVisible();
		} else {
			const heading = this.headings.getByText(headingText);
			await expect(heading).toBeVisible();
		}
	}

	/**
	 * Verify document has specific tags
	 */
	async verifyTags(expectedTags: string[]) {
		for (const tag of expectedTags) {
			await expect(this.documentTags.filter({ hasText: tag })).toBeVisible();
		}
	}

	/**
	 * Verify document metadata is displayed
	 */
	async verifyMetadata() {
		// Check if created date is shown
		if (await this.createdDate.isVisible()) {
			await expect(this.createdDate).toBeVisible();
		}

		// Check if updated date is shown
		if (await this.updatedDate.isVisible()) {
			await expect(this.updatedDate).toBeVisible();
		}
	}

	/**
	 * Click the print button
	 */
	async clickPrint() {
		await this.printButton.click();
		// Note: We can't easily test actual printing in e2e,
		// but we can verify the button works
	}

	/**
	 * Click on the GitHub link
	 */
	async clickGitHubLink() {
		// Since this opens in a new tab, we handle it specially
		const [newPage] = await Promise.all([
			this.page.context().waitForEvent('page'),
			this.githubLink.click()
		]);

		await newPage.waitForLoadState();
		return newPage;
	}

	/**
	 * Verify the document path is displayed in footer
	 */
	async verifyDocumentPath(expectedPath: string) {
		await expect(this.documentPathDisplay).toContainText(expectedPath);
	}

	/**
	 * Click on a link within the document content
	 */
	async clickContentLink(linkText: string) {
		const link = this.links.getByText(linkText);
		await link.click();
		await this.waitForLoad();
	}

	/**
	 * Verify image is displayed
	 */
	async verifyImageDisplayed(imageSrc: string) {
		const image = this.images.filter({ has: this.page.locator(`[src*="${imageSrc}"]`) });
		await expect(image).toBeVisible();
	}

	/**
	 * Verify shared document is not found (404)
	 */
	async verifyNotFound() {
		await expect(this.notFoundMessage).toBeVisible();
	}

	/**
	 * Verify shared document is expired
	 */
	async verifyExpired() {
		await expect(this.expiredMessage).toBeVisible();
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
		const title = await this.page.title();
		expect(title).toContain('Shared Document');

		if (expectedDocumentTitle) {
			expect(title).toContain(expectedDocumentTitle);
		}
	}

	/**
	 * Verify that edit/share/delete actions are NOT available
	 * (This confirms the document is truly read-only)
	 */
	async verifyReadOnlyMode() {
		const editButton = this.page.getByTestId('edit-document-button');
		const shareButton = this.page.getByTestId('share-document-button');
		const deleteButton = this.page.getByTestId('delete-document-button');

		await expect(editButton).not.toBeVisible();
		await expect(shareButton).not.toBeVisible();
		await expect(deleteButton).not.toBeVisible();
	}

	/**
	 * Get the document title text
	 */
	async getDocumentTitle(): Promise<string> {
		return (await this.documentTitle.textContent()) || '';
	}

	/**
	 * Get the document content text
	 */
	async getDocumentContent(): Promise<string> {
		return (await this.documentContent.textContent()) || '';
	}

	/**
	 * Get all document tags
	 */
	async getDocumentTags(): Promise<string[]> {
		const tags = await this.documentTags.allTextContents();
		return tags.filter((tag) => tag.trim().length > 0);
	}

	/**
	 * Check if the document has any content
	 */
	async hasContent(): Promise<boolean> {
		return (
			(await this.documentContent.isVisible()) &&
			(await this.documentContent.textContent())?.trim().length > 0
		);
	}

	/**
	 * Verify the shared document has a clean, minimal layout
	 * without the main app navigation/sidebar
	 */
	async verifyMinimalLayout() {
		// Check that main app navigation elements are not present
		const sidebar = this.page.getByTestId('sidebar');
		const mainNav = this.page.getByTestId('main-navigation');
		const breadcrumbs = this.page.getByTestId('breadcrumbs');

		await expect(sidebar).not.toBeVisible();
		await expect(mainNav).not.toBeVisible();
		await expect(breadcrumbs).not.toBeVisible();

		// But header and footer should be present
		await expect(this.header).toBeVisible();
		await expect(this.footer).toBeVisible();
	}
}
