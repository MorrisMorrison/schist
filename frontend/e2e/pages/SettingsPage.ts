import { type Page, type Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class SettingsPage extends BasePage {
	readonly pageTitle: Locator;
	readonly githubSetupTab: Locator;
	readonly githubSyncTab: Locator;
	readonly githubTokenInput: Locator;
	readonly githubOwnerInput: Locator;
	readonly githubRepositoryInput: Locator;
	readonly githubBranchInput: Locator;
	readonly githubTestConnectionButton: Locator;
	readonly githubSetupButton: Locator;
	readonly githubDisconnectButton: Locator;
	readonly githubSyncNowButton: Locator;
	readonly githubErrorAlert: Locator;
	readonly githubErrorMessage: Locator;
	readonly githubConnectionTestResult: Locator;
	readonly githubStatusConnected: Locator;
	readonly githubStatusDisconnected: Locator;

	constructor(page: Page) {
		super(page);

		this.pageTitle = page.locator('h1').getByText('Settings');
		this.githubSetupTab = page.getByTestId('github-setup-tab');
		this.githubSyncTab = page.getByTestId('github-sync-tab');
		this.githubTokenInput = page.getByTestId('github-token-input');
		this.githubOwnerInput = page.getByTestId('github-owner-input');
		this.githubRepositoryInput = page.getByTestId('github-repository-input');
		this.githubBranchInput = page.getByTestId('github-branch-input');
		this.githubTestConnectionButton = page.getByTestId('github-test-connection-button');
		this.githubSetupButton = page.getByTestId('github-setup-button');
		this.githubDisconnectButton = page.getByTestId('github-disconnect-button');
		this.githubSyncNowButton = page.getByTestId('github-sync-now-button');
		this.githubErrorAlert = page.getByTestId('github-error-alert');
		this.githubErrorMessage = page.getByTestId('github-error-message');
		this.githubConnectionTestResult = page.getByTestId('github-connection-test-result');
		this.githubStatusConnected = page.getByTestId('github-status-connected');
		this.githubStatusDisconnected = page.getByTestId('github-status-disconnected');
	}

	async navigate() {
		await this.goto('/settings');
		await this.waitForLoad();
	}

	async verifyLoaded() {
		await this.waitForVisible(this.pageTitle);
		await expect(this.pageTitle).toBeVisible();
	}

	async clickSetupTab() {
		await this.githubSetupTab.click();
	}

	async clickSyncTab() {
		await this.githubSyncTab.click();
	}

	async fillGitHubForm(token: string, owner: string, repository: string, branch: string = 'main') {
		await this.githubTokenInput.fill(token);
		await this.githubOwnerInput.fill(owner);
		await this.githubRepositoryInput.fill(repository);
		await this.githubBranchInput.fill(branch);
	}

	async testConnection() {
		await this.githubTestConnectionButton.click();
	}

	async setupGitHub() {
		await this.githubSetupButton.click();
	}

	async disconnectGitHub() {
		await this.githubDisconnectButton.click();
	}

	async syncNow() {
		await this.githubSyncNowButton.click();
	}
}
