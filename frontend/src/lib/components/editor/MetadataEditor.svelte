<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Separator } from '$lib/components/ui/separator';
	import TagInput from './TagInput.svelte';
	import { Calendar, FileText, Hash, Tag, FolderOpen } from 'lucide-svelte';

	interface Props {
		title: string;
		tags: string[];
		slug?: string;
		path?: string;
		created?: string;
		updated?: string;
		onTitleChange: (title: string) => void;
		onTagsChange: (tags: string[]) => void;
		readonly?: boolean;
		showAdvanced?: boolean;
	}

	let {
		title = '',
		tags = [],
		slug,
		path,
		created,
		updated,
		onTitleChange,
		onTagsChange,
		readonly = false,
		showAdvanced = false
	}: Props = $props();

	let showAdvancedMetadata = $state(showAdvanced);

	function formatDate(dateString?: string): string {
		if (!dateString) return 'Not set';
		return new Date(dateString).toLocaleString();
	}

	function getSlugFromTitle(title: string): string {
		return title
			.toLowerCase()
			.trim()
			.replace(/[^a-z0-9\s-]/g, '')
			.replace(/\s+/g, '-')
			.replace(/-+/g, '-')
			.replace(/^-|-$/g, '');
	}

	const computedSlug = $derived(slug || getSlugFromTitle(title));
</script>

<div class="space-y-6">
	<!-- Primary Metadata -->
	<div class="space-y-4">
		<div class="flex items-center gap-2">
			<FileText class="text-muted-foreground h-4 w-4" />
			<h3 class="text-lg font-semibold">Document Information</h3>
		</div>

		<!-- Title Input -->
		<div class="space-y-2">
			<Label for="title" class="flex items-center gap-2 text-sm font-medium">
				<Hash class="h-3 w-3" />
				Document Title
			</Label>
			<Input
				id="title"
				bind:value={title}
				oninput={(e) => onTitleChange(e.currentTarget.value)}
				placeholder="Enter document title..."
				disabled={readonly}
				class="text-base"
				data-testid="document-title-input"
			/>
			{#if title && computedSlug}
				<p class="text-muted-foreground text-xs">
					Slug: <code class="bg-muted rounded px-1 py-0.5 font-mono">{computedSlug}</code>
				</p>
			{/if}
		</div>

		<!-- Tags Input -->
		<div class="space-y-2">
			<Label for="tags" class="flex items-center gap-2 text-sm font-medium">
				<Tag class="h-3 w-3" />
				Tags
			</Label>
			<div data-testid="tags-input-container">
				<TagInput {tags} {onTagsChange} placeholder="Add tags..." disabled={readonly} />
			</div>
		</div>
	</div>

	<!-- Advanced Metadata Section -->
	<div>
		<Button
			variant="ghost"
			size="sm"
			onclick={() => (showAdvancedMetadata = !showAdvancedMetadata)}
			class="text-muted-foreground hover:text-foreground gap-2"
		>
			<Calendar class="h-3 w-3" />
			{showAdvancedMetadata ? 'Hide' : 'Show'} Advanced Metadata
		</Button>

		{#if showAdvancedMetadata}
			<div class="mt-4 space-y-4" data-testid="advanced-metadata-section">
				<Separator />

				<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
					<!-- Path Information -->
					{#if path}
						<div class="space-y-2">
							<Label class="flex items-center gap-2 text-sm font-medium">
								<FolderOpen class="h-3 w-3" />
								Full Path
							</Label>
							<div class="bg-muted/50 rounded-md border p-3">
								<code class="text-muted-foreground text-sm">{path}</code>
							</div>
						</div>
					{/if}

					<!-- Slug Information -->
					<div class="space-y-2">
						<Label class="text-sm font-medium">Generated Slug</Label>
						<div class="bg-muted/50 rounded-md border p-3">
							<code class="text-muted-foreground text-sm"
								>{computedSlug || 'Will be generated from title'}</code
							>
						</div>
					</div>

					<!-- Creation Date -->
					{#if created}
						<div class="space-y-2">
							<Label class="flex items-center gap-2 text-sm font-medium">
								<Calendar class="h-3 w-3" />
								Created
							</Label>
							<div class="bg-muted/50 rounded-md border p-3">
								<span class="text-muted-foreground text-sm">{formatDate(created)}</span>
							</div>
						</div>
					{/if}

					<!-- Last Updated -->
					{#if updated}
						<div class="space-y-2">
							<Label class="flex items-center gap-2 text-sm font-medium">
								<Calendar class="h-3 w-3" />
								Last Updated
							</Label>
							<div class="bg-muted/50 rounded-md border p-3">
								<span class="text-muted-foreground text-sm">{formatDate(updated)}</span>
							</div>
						</div>
					{/if}
				</div>
			</div>
		{/if}
	</div>
</div>
