import { type Page, type Locator } from '@playwright/test';
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
	readonly githubConnectionTestResult: Locator;

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
		this.githubConnectionTestResult = page.getByTestId('github-connection-test-result');
	}

	async navigate() {
		await this.goto('/settings');
		await this.waitForLoad();
	}

	async verifyLoaded() {
		await this.waitForContentReady(this.pageTitle);
	}

	async clickSetupTab() {
		await this.githubSetupTab.click();
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
}
