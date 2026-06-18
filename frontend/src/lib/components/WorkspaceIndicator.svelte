<script lang="ts">
	import { Users } from '@lucide/svelte';
	import { workspaceStore } from '$lib/stores/workspace.svelte';
	import { authStore } from '$lib/stores/auth.svelte';

	// Load workspace info on mount and whenever the auth state changes
	$effect(() => {
		if (authStore.user) {
			workspaceStore.loadUsers();
		} else {
			workspaceStore.reset();
		}
	});
</script>

{#if authStore.user && workspaceStore.isSharedWorkspace}
	<div
		class="text-muted-foreground flex items-center gap-2 text-sm"
		title="This is a shared workspace with {workspaceStore.userCount} users"
		data-testid="workspace-indicator"
	>
		<Users class="h-4 w-4" />
		<span>Shared Workspace • {workspaceStore.userCount} users</span>
	</div>
{/if}
