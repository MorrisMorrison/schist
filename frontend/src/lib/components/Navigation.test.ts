import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';

const pageState = vi.hoisted(() => ({ url: new URL('http://localhost/') }));

vi.mock('$app/state', () => ({ page: pageState }));

vi.mock('$lib/api/client', () => ({
	apiClient: {
		setAuthToken: vi.fn(),
		getSecretsStatus: vi.fn(),
		listSecrets: vi.fn()
	}
}));

vi.mock('$lib/auth/auth-service', () => ({
	authService: { logout: vi.fn() }
}));

vi.mock('$lib/stores/passkeys.svelte', () => ({
	passkeyStore: { authenticateWithPasskey: vi.fn() }
}));

import { apiClient } from '$lib/api/client';
import { authService } from '$lib/auth/auth-service';
import { authActions } from '$lib/stores/auth.svelte';
import { passkeyStore } from '$lib/stores/passkeys.svelte';
import { secretStore } from '$lib/stores/secrets.svelte';
import { sidebar, sidebarActions } from '$lib/stores/sidebar.svelte';
import Navigation from './Navigation.svelte';

const user = { username: 'ada', created_at: '', last_login: '' };
const lockedStatus = { unlocked: false, has_secrets: true } as never;
const unlockedStatus = { unlocked: true, has_secrets: true } as never;

function openMobileMenu() {
	return fireEvent.click(screen.getByRole('button', { name: 'Toggle navigation menu' }));
}

describe('Navigation', () => {
	let sidebarWasOpen: boolean;

	beforeEach(() => {
		sidebarWasOpen = sidebar.isOpen;
		pageState.url = new URL('http://localhost/');
		vi.mocked(apiClient.getSecretsStatus).mockResolvedValue(lockedStatus);
		vi.mocked(apiClient.listSecrets).mockResolvedValue({ secrets: ['api-key'] } as never);
	});

	afterEach(() => {
		cleanup();
		authActions.clearAuth();
		secretStore.reset();
		if (sidebar.isOpen !== sidebarWasOpen) sidebarActions.toggle();
		vi.clearAllMocks();
		vi.restoreAllMocks();
	});

	it('shows the brand, links and settings for a signed-out visitor', () => {
		render(Navigation);

		expect(screen.getByAltText('Schist Logo')).toBeInTheDocument();
		expect(screen.getByTestId('nav-home')).toHaveClass('border-primary');
		expect(screen.getByTestId('nav-recent')).not.toHaveClass('border-primary');
		expect(screen.getByTitle('Settings')).toHaveAttribute('href', '/settings');
		expect(screen.queryByTestId('user-info')).not.toBeInTheDocument();
		expect(screen.queryByTestId('quick-unlock-button')).not.toBeInTheDocument();
		expect(apiClient.getSecretsStatus).not.toHaveBeenCalled();
	});

	it('highlights Recent on the recent page', () => {
		pageState.url = new URL('http://localhost/recent');
		render(Navigation);

		expect(screen.getByTestId('nav-recent')).toHaveClass('border-primary');
		expect(screen.getByTestId('nav-home')).not.toHaveClass('border-primary');
	});

	it('opens the quick switcher', async () => {
		const listener = vi.fn();
		window.addEventListener('openQuickSwitcher', listener);
		render(Navigation);

		await fireEvent.click(screen.getByTestId('quick-switcher-button'));

		expect(listener).toHaveBeenCalledTimes(1);
		window.removeEventListener('openQuickSwitcher', listener);
	});

	it('opens the keyboard shortcuts', async () => {
		const listener = vi.fn();
		window.addEventListener('openKeyboardShortcuts', listener);
		render(Navigation);

		await fireEvent.click(screen.getByTestId('keyboard-shortcuts-button'));

		expect(listener).toHaveBeenCalledTimes(1);
		window.removeEventListener('openKeyboardShortcuts', listener);
	});

	it('toggles the sidebar from the panel button', async () => {
		render(Navigation, { props: { isSidebarOpen: true } });
		const before = sidebar.isOpen;

		await fireEvent.click(screen.getByRole('button', { name: /^(Open|Close) sidebar$/ }));

		expect(sidebar.isOpen).toBe(!before);
	});

	it('shows the user and logs out', async () => {
		authActions.setAuth('token', user);
		render(Navigation);

		expect(screen.getByTestId('user-info')).toHaveTextContent('ada');
		await fireEvent.click(screen.getByTestId('logout-button'));

		expect(authService.logout).toHaveBeenCalledTimes(1);
	});

	it('unlocks secrets with a passkey from the lock button', async () => {
		authActions.setAuth('token', user);
		vi.mocked(passkeyStore.authenticateWithPasskey).mockImplementation(async () => {
			vi.mocked(apiClient.getSecretsStatus).mockResolvedValue(unlockedStatus);
			return 'cred';
		});
		render(Navigation);
		await vi.waitFor(() => expect(apiClient.getSecretsStatus).toHaveBeenCalled());

		await fireEvent.click(await screen.findByTestId('quick-unlock-button'));

		expect(await screen.findByTestId('secrets-unlocked-indicator')).toBeInTheDocument();
		expect(passkeyStore.authenticateWithPasskey).toHaveBeenCalledTimes(1);
		await vi.waitFor(() => expect(apiClient.listSecrets).toHaveBeenCalled());
	});

	it('keeps the lock button when the passkey unlock fails', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		authActions.setAuth('token', user);
		vi.mocked(passkeyStore.authenticateWithPasskey).mockRejectedValue(new Error('cancelled'));
		render(Navigation);

		await fireEvent.click(await screen.findByTestId('quick-unlock-button'));

		await vi.waitFor(() => expect(error).toHaveBeenCalled());
		expect(screen.getByTestId('quick-unlock-button')).not.toBeDisabled();
	});

	it('ignores a second unlock click while one is running', async () => {
		authActions.setAuth('token', user);
		let finish!: () => void;
		vi.mocked(passkeyStore.authenticateWithPasskey).mockReturnValue(
			new Promise((resolve) => (finish = () => resolve('cred')))
		);
		render(Navigation);
		const button = await screen.findByTestId('quick-unlock-button');

		await fireEvent.click(button);
		expect(button).toBeDisabled();
		await fireEvent.click(button);

		expect(passkeyStore.authenticateWithPasskey).toHaveBeenCalledTimes(1);
		finish();
		await vi.waitFor(() => expect(button).not.toBeDisabled());
	});

	describe('mobile menu', () => {
		it('opens and closes the menu', async () => {
			render(Navigation);
			const toggle = screen.getByRole('button', { name: 'Toggle navigation menu' });
			expect(toggle).toHaveAttribute('aria-expanded', 'false');

			await openMobileMenu();
			expect(toggle).toHaveAttribute('aria-expanded', 'true');
			expect(screen.getByTestId('nav-recent-mobile')).toBeInTheDocument();

			await openMobileMenu();
			expect(screen.queryByTestId('nav-recent-mobile')).not.toBeInTheDocument();
		});

		it('opens the quick switcher and closes the menu', async () => {
			const listener = vi.fn();
			window.addEventListener('openQuickSwitcher', listener);
			render(Navigation);
			await openMobileMenu();

			await fireEvent.click(screen.getByTestId('quick-switcher-button-mobile'));

			expect(listener).toHaveBeenCalledTimes(1);
			expect(screen.queryByTestId('quick-switcher-button-mobile')).not.toBeInTheDocument();
			window.removeEventListener('openQuickSwitcher', listener);
		});

		it('closes the menu from its links', async () => {
			render(Navigation);
			await openMobileMenu();
			const recent = screen.getByTestId('nav-recent-mobile');
			recent.addEventListener('click', (e) => e.preventDefault());

			await fireEvent.click(recent);

			expect(screen.queryByTestId('nav-recent-mobile')).not.toBeInTheDocument();
		});

		it('closes the menu from the settings link and highlights the current page', async () => {
			pageState.url = new URL('http://localhost/recent');
			render(Navigation);
			await openMobileMenu();
			expect(screen.getByTestId('nav-recent-mobile')).toHaveClass('border-primary');
			const settings = screen.getByText('Settings').closest('a')!;
			settings.addEventListener('click', (e) => e.preventDefault());

			await fireEvent.click(settings);

			expect(screen.queryByTestId('nav-recent-mobile')).not.toBeInTheDocument();
		});

		it('shows the signed-in user, logs out and unlocks', async () => {
			authActions.setAuth('token', user);
			vi.mocked(passkeyStore.authenticateWithPasskey).mockResolvedValue('cred');
			render(Navigation);
			await openMobileMenu();

			expect(screen.getByTestId('user-info-mobile')).toHaveTextContent('Signed in as ada');
			await fireEvent.click(await screen.findByTestId('quick-unlock-button-mobile'));
			expect(passkeyStore.authenticateWithPasskey).toHaveBeenCalledTimes(1);

			await openMobileMenu();
			await fireEvent.click(screen.getByTestId('logout-button-mobile'));
			expect(authService.logout).toHaveBeenCalledTimes(1);
		});

		it('shows the unlocked state', async () => {
			vi.mocked(apiClient.getSecretsStatus).mockResolvedValue(unlockedStatus);
			authActions.setAuth('token', user);
			render(Navigation);
			await screen.findByTestId('secrets-unlocked-indicator');

			await openMobileMenu();

			expect(screen.getByText('Secrets Unlocked')).toBeInTheDocument();
		});
	});
});
