import { test, expect } from '../fixtures';

test.describe('GitHub Integration', () => {
	test.beforeEach(async ({ settingsPage }) => {
		await settingsPage.navigate();
		await settingsPage.verifyLoaded();
	});

	test.describe('Setup Tab', () => {
		test('should display GitHub integration form', async ({ settingsPage }) => {
			await expect(settingsPage.githubSetupTab).toBeVisible();
			await settingsPage.clickSetupTab();

			await expect(settingsPage.githubTokenInput).toBeVisible();
			await expect(settingsPage.githubOwnerInput).toBeVisible();
			await expect(settingsPage.githubRepositoryInput).toBeVisible();
			await expect(settingsPage.githubBranchInput).toBeVisible();
			await expect(settingsPage.githubTestConnectionButton).toBeVisible();
			await expect(settingsPage.githubSetupButton).toBeVisible();
		});

		test('should keep setup button disabled when form is empty', async ({ settingsPage }) => {
			await settingsPage.clickSetupTab();

			await expect(settingsPage.githubSetupButton).toBeDisabled();
		});

		test('should enable buttons as form fields are filled', async ({ settingsPage }) => {
			await settingsPage.clickSetupTab();

			await expect(settingsPage.githubTestConnectionButton).toBeDisabled();
			await expect(settingsPage.githubSetupButton).toBeDisabled();

			await settingsPage.githubTokenInput.fill('test-token');
			await settingsPage.githubOwnerInput.fill('test-owner');
			await settingsPage.githubRepositoryInput.fill('test-repo');

			await expect(settingsPage.githubTestConnectionButton).toBeEnabled();
			await expect(settingsPage.githubSetupButton).toBeEnabled();
		});

		test('should enable test connection button when form is filled', async ({ settingsPage }) => {
			await settingsPage.clickSetupTab();

			await expect(settingsPage.githubTestConnectionButton).toBeDisabled();

			await settingsPage.fillGitHubForm('test-token', 'test-owner', 'test-repo');

			await expect(settingsPage.githubTestConnectionButton).toBeEnabled();
		});

		test('should enable setup button when form is valid', async ({ settingsPage }) => {
			await settingsPage.clickSetupTab();

			await expect(settingsPage.githubSetupButton).toBeDisabled();

			await settingsPage.fillGitHubForm('test-token', 'test-owner', 'test-repo');

			await expect(settingsPage.githubSetupButton).toBeEnabled();
		});
	});

	test.describe('Connection Testing', () => {
		test('should handle test connection with invalid credentials', async ({ settingsPage }) => {
			await settingsPage.clickSetupTab();

			await settingsPage.fillGitHubForm('invalid-token', 'nonexistent-owner', 'nonexistent-repo');

			await settingsPage.testConnection();

			await expect(settingsPage.githubConnectionTestResult).toBeVisible();
		});
	});

	test.describe('Tab Navigation', () => {
		test('should show both setup and sync tabs', async ({ settingsPage }) => {
			await expect(settingsPage.githubSetupTab).toBeVisible();
			await expect(settingsPage.githubSyncTab).toBeVisible();

			await settingsPage.clickSetupTab();
			await expect(settingsPage.githubTokenInput).toBeVisible();
		});

		test('should disable sync tab when not connected', async ({ settingsPage }) => {
			await expect(settingsPage.githubSyncTab).toBeDisabled();
		});
	});

	test.describe('Button States', () => {
		test('should keep test connection button disabled until form is filled', async ({
			settingsPage
		}) => {
			await settingsPage.clickSetupTab();

			await expect(settingsPage.githubTestConnectionButton).toBeDisabled();

			await settingsPage.githubTokenInput.fill('test-token');
			await expect(settingsPage.githubTestConnectionButton).toBeDisabled();

			await settingsPage.githubOwnerInput.fill('test-owner');
			await expect(settingsPage.githubTestConnectionButton).toBeDisabled();

			await settingsPage.githubRepositoryInput.fill('test-repo');
			await expect(settingsPage.githubTestConnectionButton).toBeEnabled();
		});
	});

	test.describe('Sync Tab', () => {
		test('should be disabled when GitHub is not connected', async ({ settingsPage }) => {
			await expect(settingsPage.githubSyncTab).toBeDisabled();
		});
	});
});
