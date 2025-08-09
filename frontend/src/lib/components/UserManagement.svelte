<script lang="ts">
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Badge } from '$lib/components/ui/badge';
	import { Users, Plus, Trash2, Shield, User, Fingerprint } from 'lucide-svelte';
	import { apiClient } from '$lib/api/client';
	import { registerPasskey } from '$lib/utils/webauthn';
	import type { UserInfo } from '$lib/api/types';

	let users: UserInfo[] = [];
	let loading = true;
	let error = '';
	let showAddUser = false;
	let newUsername = '';
	let newUserIsAdmin = false;
	let addingUser = false;

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

	async function addUser() {
		if (!newUsername.trim()) {
			error = 'Username is required';
			return;
		}

		addingUser = true;
		error = '';

		try {
			// Register passkey for new user
			const credentialId = await registerPasskey(newUsername);

			// Create user
			await apiClient.createUser({
				username: newUsername.trim(),
				is_admin: newUserIsAdmin,
				credential_id: credentialId
			});

			// Reset form
			newUsername = '';
			newUserIsAdmin = false;
			showAddUser = false;

			// Reload users list
			await loadUsers();
		} catch (err) {
			console.error('Failed to add user:', err);
			error = err instanceof Error ? err.message : 'Failed to add user';
		} finally {
			addingUser = false;
		}
	}

	async function deleteUser(username: string) {
		if (!confirm(`Are you sure you want to delete user "${username}"?`)) {
			return;
		}

		try {
			await apiClient.deleteUser(username);

			// Reload users list
			await loadUsers();
		} catch (err) {
			console.error('Failed to delete user:', err);
			error = err instanceof Error ? err.message : 'Failed to delete user';
		}
	}

	function formatDate(dateStr: string) {
		return new Date(dateStr).toLocaleDateString();
	}
</script>

<Card>
	<CardHeader>
		<CardTitle class="flex items-center gap-2">
			<Users class="h-5 w-5" />
			User Management
		</CardTitle>
		<CardDescription>
			Manage user accounts and permissions. All users authenticate with passkeys only.
		</CardDescription>
	</CardHeader>

	<CardContent class="space-y-6">
		{#if error}
			<div
				class="border-destructive/20 bg-destructive/10 text-destructive rounded-md border p-3 text-sm"
			>
				{error}
			</div>
		{/if}

		{#if loading}
			<div class="flex items-center justify-center py-8">
				<div
					class="border-primary h-6 w-6 animate-spin rounded-full border-2 border-t-transparent"
				></div>
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
						onclick={() => (showAddUser = !showAddUser)}
						disabled={addingUser}
					>
						<Plus class="h-4 w-4" />
						Add User
					</Button>
				</div>

				{#if showAddUser}
					<Card>
						<CardHeader>
							<CardTitle class="text-base">Add New User</CardTitle>
							<CardDescription>
								Create a new user account with passkey authentication
							</CardDescription>
						</CardHeader>
						<CardContent class="space-y-4">
							<div class="space-y-2">
								<Label for="new-username">Username</Label>
								<Input
									id="new-username"
									type="text"
									placeholder="Enter username"
									bind:value={newUsername}
									disabled={addingUser}
								/>
							</div>

							<div class="flex items-center space-x-2">
								<input
									id="admin-checkbox"
									type="checkbox"
									bind:checked={newUserIsAdmin}
									disabled={addingUser}
								/>
								<Label for="admin-checkbox" class="text-sm font-normal">
									Administrator privileges
								</Label>
							</div>

							<div class="flex gap-2">
								<Button
									variant="default"
									size="sm"
									onclick={addUser}
									disabled={addingUser || !newUsername.trim()}
									class="flex items-center gap-2"
								>
									{#if addingUser}
										<div
											class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
										></div>
										Creating...
									{:else}
										<Fingerprint class="h-4 w-4" />
										Create with Passkey
									{/if}
								</Button>
								<Button
									variant="outline"
									size="sm"
									onclick={() => (showAddUser = false)}
									disabled={addingUser}
								>
									Cancel
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
										<span class="font-medium">{user.username}</span>
										{#if user.is_admin}
											<Badge variant="secondary" class="text-xs">Admin</Badge>
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
								onclick={() => deleteUser(user.username)}
								class="text-destructive hover:text-destructive flex items-center gap-2"
							>
								<Trash2 class="h-4 w-4" />
								Delete
							</Button>
						</div>
					{:else}
						<div class="text-muted-foreground text-center py-8">
							<Users class="mx-auto h-12 w-12 opacity-50" />
							<p class="mt-2">No users found</p>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</CardContent>
</Card>
