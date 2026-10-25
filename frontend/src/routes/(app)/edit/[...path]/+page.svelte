<script lang="ts">
	import DocumentEditView from '$lib/components/editor/DocumentEditView.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<!-- SvelteKit reuses this page when navigating /edit/a → /edit/b. Keying on the path
     remounts the editor so content, dirty state and the auto-save timer start fresh. -->
{#key data.path}
	<DocumentEditView document={data.document} path={data.path} />
{/key}
