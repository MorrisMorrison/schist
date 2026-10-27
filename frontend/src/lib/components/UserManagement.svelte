<script lang="ts">
	import { formatDate } from '#lib/utils/date.ts';
	import { onMount } from 'svelte';
	import { Button } from '#lib/components/ui/button/index.ts';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '#lib/components/ui/card/index.ts';
	import { Input } from '#lib/components/ui/input/index.ts';
	import { Label } from '#lib/components/ui/label/index.ts';
	import { Badge } from '#lib/components/ui/badge/index.ts';
	import { Users, Plus, Trash2, Shield, User, Copy, ExternalLink } from '@lucide/svelte';
	import { apiClient } from '#lib/api/client.ts';
	import LoadingSpinner from '#lib/components/LoadingSpinner.svelte';
	import ErrorAlert from '#lib/components/ErrorAlert.svelte';
	import { getErrorMessage } from '#lib/utils/error.ts';
	import type { UserInfo } from '#lib/api/types.ts';

	let users: UserInfo[] = $state([]);
	let loading = $state(true);
	let error = $state('');
	let showInviteDialog = $state(false);
	let inviteURL = $state('');
	let generatingInvite = $state(false);

	onMount(() => {
		loadUsers();
	});

	async function loadUsers() {
		try {
			loading = true;
			const response = await apiClient.listUsers();
			users = response.users || [];
		} catch (err) {
			console.error('Failed to load users:', err);
			error = 'Failed to load users';
		} finally {
			loading = false;
		}
	}

	async function generateInvite() {
		generatingInvite = true;
		error = '';

		try {
			const response = await apiClient.generateInviteToken();
			inviteURL = response.invite_url;
			showInviteDialog = true;
		} catch (err) {
			console.error('Failed to generate invite:', err);
			error = getErrorMessage(err, 'Failed to generate invite');
		} finally {
			generatingInvite = false;
		}
	}

	async function copyInviteURL() {
		try {
			await navigator.clipboard.writeText(inviteURL);
			// Could add a toast notification here
		} catch (err) {
			console.error('Failed to copy invite URL:', err);
		}
	}

	async function deleteUser(username: string, isAdmin: boolean) {
		if (isAdmin) {
			error = 'Cannot delete the admin user';
			return;
		}

		if (!confirm(`Are you sure you want to delete user "${username}"?`)) {
			return;
		}

		try {
			await apiClient.deleteUser(username);

			// Reload users list
			await loadUsers();
		} catch (err) {
			console.error('Failed to delete user:', err);
			error = getErrorMessage(err, 'Failed to delete user');
		}
	}
</script>

<Card>
	<CardHeader>
		<CardTitle class="flex items-center gap-2" data-testid="user-management-title">
			<Users class="h-5 w-5" />
			User Management
		</CardTitle>
		<CardDescription>
			Invite users to the shared workspace. All users have equal access and authenticate with
			passkeys.
		</CardDescription>
	</CardHeader>

	<CardContent class="space-y-6">
		{#if error}
			<ErrorAlert {error} />
		{/if}

		{#if loading}
			<div class="flex items-center justify-center py-8">
				<LoadingSpinner size="md" />
				<span class="text-muted-foreground ml-2 text-sm">Loading users...</span>
			</div>
		{:else}
			<div class="space-y-4">
				<div class="flex items-center justify-between">
					<h3 class="text-lg font-medium">Users ({users.length})</h3>
					<Button
						variant="outline"
						size="sm"
						class="flex items-center gap-2"
						onclick={generateInvite}
						disabled={generatingInvite}
						data-testid="invite-user-button"
					>
						<Plus class="h-4 w-4" />
						{generatingInvite ? 'Generating...' : 'Invite User'}
					</Button>
				</div>

				{#if showInviteDialog}
					<Card>
						<CardHeader>
							<CardTitle class="text-base" data-testid="invitation-dialog-title"
								>Invite User</CardTitle
							>
							<CardDescription>
								Share this invitation link with the person you want to invite. The link expires in 7
								days.
							</CardDescription>
						</CardHeader>
						<CardContent class="space-y-4">
							<div class="space-y-2">
								<Label for="invite-url">Invitation Link</Label>
								<div class="flex gap-2">
									<Input
										id="invite-url"
										type="text"
										value={inviteURL}
										readonly
										class="font-mono text-sm"
									/>
									<Button
										variant="outline"
										size="sm"
										onclick={copyInviteURL}
										class="flex items-center gap-1"
										data-testid="copy-invite-button"
									>
										<Copy class="h-4 w-4" />
										Copy
									</Button>
								</div>
							</div>

							<div class="flex gap-2">
								<Button
									variant="default"
									size="sm"
									onclick={() => window.open(inviteURL, '_blank')}
									class="flex items-center gap-2"
								>
									<ExternalLink class="h-4 w-4" />
									Open Link
								</Button>
								<Button variant="outline" size="sm" onclick={() => (showInviteDialog = false)}>
									Close
								</Button>
							</div>
						</CardContent>
					</Card>
				{/if}

				<div class="space-y-2">
					{#each users as user (user.username)}
						<div class="border-border flex items-center justify-between rounded-lg border p-4">
							<div class="flex items-center gap-3">
								<div class="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-full">
									{#if user.is_admin}
										<Shield class="text-primary h-5 w-5" />
									{:else}
										<User class="text-muted-foreground h-5 w-5" />
									{/if}
								</div>
								<div>
									<div class="flex items-center gap-2">
										<span class="font-medium" data-testid="user-item-username">{user.username}</span
										>
										{#if user.is_admin}
											<Badge variant="secondary" class="text-xs" data-testid="admin-badge"
												>Admin</Badge
											>
										{/if}
									</div>
									<div class="text-muted-foreground text-sm">
										{user.passkey_ids.length} passkey{user.passkey_ids.length !== 1 ? 's' : ''} • Created
										{formatDate(user.created_at)}
										{#if user.last_login}
											• Last login {formatDate(user.last_login)}
										{/if}
									</div>
								</div>
							</div>

							<Button
								variant="outline"
								size="sm"
								onclick={() => deleteUser(user.username, user.is_admin)}
								disabled={user.is_admin}
								class="text-destructive hover:text-destructive flex items-center gap-2 disabled:opacity-50"
							>
								<Trash2 class="h-4 w-4" />
								{user.is_admin ? 'Protected' : 'Delete'}
							</Button>
						</div>
					{:else}
						<div class="text-muted-foreground py-8 text-center">
							<Users class="mx-auto h-12 w-12 opacity-50" />
							<p class="mt-2">No users found</p>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</CardContent>
</Card>
