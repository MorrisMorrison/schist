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

		test('should progressively enable buttons as required fields are filled', async ({
			settingsPage
		}) => {
			await settingsPage.clickSetupTab();

			// Empty form: both action buttons disabled
			await expect(settingsPage.githubTestConnectionButton).toBeDisabled();
			await expect(settingsPage.githubSetupButton).toBeDisabled();

			// Partially filled: still disabled until all required fields are present
			await settingsPage.githubTokenInput.fill('test-token');
			await expect(settingsPage.githubTestConnectionButton).toBeDisabled();
			await expect(settingsPage.githubSetupButton).toBeDisabled();

			await settingsPage.githubOwnerInput.fill('test-owner');
			await expect(settingsPage.githubTestConnectionButton).toBeDisabled();
			await expect(settingsPage.githubSetupButton).toBeDisabled();

			// All required fields filled: both buttons enabled
			await settingsPage.githubRepositoryInput.fill('test-repo');
			await expect(settingsPage.githubTestConnectionButton).toBeEnabled();
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
});
