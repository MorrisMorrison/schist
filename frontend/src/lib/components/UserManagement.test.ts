import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { apiClient } from '$lib/api/client';
import type { UserInfo } from '$lib/api/types';
import UserManagement from './UserManagement.svelte';

vi.mock('$lib/api/client', () => ({
	apiClient: { listUsers: vi.fn(), generateInviteToken: vi.fn(), deleteUser: vi.fn() }
}));

const users: UserInfo[] = [
	{
		username: 'admin',
		passkey_ids: ['a', 'b'],
		is_admin: true,
		created_at: '2024-01-01T00:00:00Z',
		last_login: '2024-02-01T00:00:00Z'
	},
	{
		username: 'bob',
		passkey_ids: ['c'],
		is_admin: false,
		created_at: '2024-01-05T00:00:00Z',
		last_login: ''
	}
];

describe('UserManagement', () => {
	beforeEach(() => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.mocked(apiClient.listUsers).mockResolvedValue({ users } as never);
	});

	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
		vi.restoreAllMocks();
	});

	function bobDelete() {
		return screen.getByRole('button', { name: 'Delete' });
	}

	it('shows a loading state, then lists users', async () => {
		render(UserManagement);
		expect(screen.getByText('Loading users...')).toBeInTheDocument();
		expect(await screen.findByText('Users (2)')).toBeInTheDocument();
		expect(screen.getAllByTestId('user-item-username').map((e) => e.textContent)).toEqual([
			'admin',
			'bob'
		]);
		expect(screen.getAllByTestId('admin-badge')).toHaveLength(1);
		expect(screen.getByText(/2 passkeys/)).toBeInTheDocument();
		expect(screen.getByText(/1 passkey •/)).toBeInTheDocument();
		expect(screen.getAllByText(/Last login/)).toHaveLength(1);
		expect(screen.getByRole('button', { name: 'Protected' })).toBeDisabled();
	});

	it('shows an empty list', async () => {
		vi.mocked(apiClient.listUsers).mockResolvedValue({} as never);
		render(UserManagement);
		expect(await screen.findByText('No users found')).toBeInTheDocument();
		expect(screen.getByText('Users (0)')).toBeInTheDocument();
	});

	it('shows an error when users fail to load', async () => {
		vi.mocked(apiClient.listUsers).mockRejectedValue(new Error('down'));
		render(UserManagement);
		expect(await screen.findByText('Failed to load users')).toBeInTheDocument();
	});

	it('generates an invite and lets you copy, open and close it', async () => {
		vi.mocked(apiClient.generateInviteToken).mockResolvedValue({
			invite_url: 'https://wiki.test/invite/abc'
		} as never);
		const writeText = vi.fn().mockResolvedValue(undefined);
		vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue({ writeText } as never);
		const open = vi.spyOn(window, 'open').mockReturnValue(null);
		render(UserManagement);
		await screen.findByText('Users (2)');

		await userEvent.click(screen.getByTestId('invite-user-button'));
		expect(await screen.findByTestId('invitation-dialog-title')).toBeInTheDocument();
		expect(screen.getByLabelText('Invitation Link')).toHaveValue('https://wiki.test/invite/abc');

		await userEvent.click(screen.getByTestId('copy-invite-button'));
		expect(writeText).toHaveBeenCalledWith('https://wiki.test/invite/abc');

		await userEvent.click(screen.getByRole('button', { name: 'Open Link' }));
		expect(open).toHaveBeenCalledWith('https://wiki.test/invite/abc', '_blank');

		await userEvent.click(screen.getByRole('button', { name: 'Close' }));
		expect(screen.queryByTestId('invitation-dialog-title')).not.toBeInTheDocument();
	});

	it('logs a clipboard failure without crashing', async () => {
		vi.mocked(apiClient.generateInviteToken).mockResolvedValue({ invite_url: 'u' } as never);
		vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue({
			writeText: vi.fn().mockRejectedValue(new Error('denied'))
		} as never);
		render(UserManagement);
		await screen.findByText('Users (2)');
		await userEvent.click(screen.getByTestId('invite-user-button'));
		await userEvent.click(await screen.findByTestId('copy-invite-button'));
		await waitFor(() =>
			expect(console.error).toHaveBeenCalledWith('Failed to copy invite URL:', expect.any(Error))
		);
	});

	it('shows progress while generating and the API error on failure', async () => {
		let reject!: (e: Error) => void;
		vi.mocked(apiClient.generateInviteToken).mockReturnValue(
			new Promise((_, r) => (reject = r)) as never
		);
		render(UserManagement);
		await screen.findByText('Users (2)');
		await userEvent.click(screen.getByTestId('invite-user-button'));
		expect(screen.getByTestId('invite-user-button')).toBeDisabled();
		expect(screen.getByTestId('invite-user-button')).toHaveTextContent('Generating...');
		reject(new Error(JSON.stringify({ error: 'Only admins can invite' })));
		expect(await screen.findByText('Only admins can invite')).toBeInTheDocument();
		expect(screen.getByTestId('invite-user-button')).toBeEnabled();
	});

	it('deletes a user after confirmation and reloads', async () => {
		const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
		vi.mocked(apiClient.deleteUser).mockResolvedValue(undefined as never);
		render(UserManagement);
		await screen.findByText('Users (2)');
		vi.mocked(apiClient.listUsers).mockResolvedValue({ users: [users[0]] } as never);
		await userEvent.click(bobDelete());
		expect(confirm).toHaveBeenCalledWith('Are you sure you want to delete user "bob"?');
		expect(apiClient.deleteUser).toHaveBeenCalledWith('bob');
		expect(await screen.findByText('Users (1)')).toBeInTheDocument();
	});

	it('does not delete when not confirmed', async () => {
		vi.spyOn(window, 'confirm').mockReturnValue(false);
		render(UserManagement);
		await screen.findByText('Users (2)');
		await userEvent.click(bobDelete());
		expect(apiClient.deleteUser).not.toHaveBeenCalled();
	});

	it('shows the API error when deletion fails', async () => {
		vi.spyOn(window, 'confirm').mockReturnValue(true);
		vi.mocked(apiClient.deleteUser).mockRejectedValue(
			new Error(JSON.stringify({ error: 'User not found' }))
		);
		render(UserManagement);
		await screen.findByText('Users (2)');
		await userEvent.click(bobDelete());
		expect(await screen.findByText('User not found')).toBeInTheDocument();
	});
});
