import { test, expect } from '../fixtures';
import type { ApiHelper } from '../utils/api-helpers';
import { WebAuthnHelper } from '../utils/webauthn-helper';

async function passkeyNames(apiHelper: ApiHelper): Promise<string[]> {
	const response = await apiHelper.request('GET', '/passkeys');
	expect(response.status).toBe(200);
	const passkeys = (response.data as { passkeys: { name: string }[] | null }).passkeys ?? [];
	return passkeys.map((passkey) => passkey.name);
}

/**
 * Settings → Passkey Security: add a second passkey (through a virtual
 * authenticator), then delete it again. The passkey the suite signs in with
 * is never touched.
 */
test.describe('Passkey management', () => {
	test('adds a passkey from Settings and deletes it again', async ({
		page,
		settingsPage,
		apiHelper,
		testId
	}) => {
		const name = `E2E key ${testId}`;
		const before = await passkeyNames(apiHelper);
		expect(before.length).toBeGreaterThan(0);

		const webauthn = new WebAuthnHelper(page);
		await webauthn.setup();
		try {
			await settingsPage.navigate();
			await settingsPage.verifyLoaded();

			await page.getByRole('button', { name: 'Add Passkey' }).click();
			const dialog = page.getByRole('dialog');
			await dialog.getByLabel('Passkey Name').fill(name);
			await dialog.getByRole('button', { name: 'Create Passkey' }).click();
			await expect(dialog.getByText('Passkey Created Successfully!')).toBeVisible({
				timeout: 30000
			});
			await expect(dialog).toBeHidden();

			const row = page.getByTestId('passkey-item').filter({ hasText: name });
			await expect(row).toBeVisible();
			expect(await passkeyNames(apiHelper)).toEqual(expect.arrayContaining([...before, name]));

			// Deleting asks for confirmation first.
			page.once('dialog', (confirm) => {
				expect(confirm.message()).toContain(name);
				confirm.accept();
			});
			await row.getByRole('button', { name: 'Delete' }).click();
			await expect(row).toBeHidden();
			expect((await passkeyNames(apiHelper)).sort()).toEqual([...before].sort());
		} finally {
			await webauthn.cleanup();
		}
	});
});
