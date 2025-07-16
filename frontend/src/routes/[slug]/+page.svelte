<script lang="ts">
	import { marked } from 'marked';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();

	// Configure marked for better rendering
	marked.setOptions({
		gfm: true,
		breaks: true
	});

	// Render markdown to HTML
	let renderedContent = $derived(data.page?.content ? marked(data.page.content) : '');
</script>

<svelte:head>
	<title>{data.page?.metaData.title} - Schist Wiki</title>
	<meta name="description" content="Wiki page: {data.page?.metaData.title}" />
</svelte:head>

<div class="space-y-6">
	<!-- Page Header -->
	<div class="border-primary border-b pb-6">
		<div class="flex items-start justify-between">
			<div class="min-w-0 flex-1">
				<h1 class="text-primary text-3xl leading-tight font-bold">
					{data.page?.metaData.title}
				</h1>
				<div class="text-secondary mt-2 flex items-center space-x-2 text-sm">
					<span>/{data.page?.metaData.slug}</span>
				</div>
			</div>

			<div class="flex flex-shrink-0 space-x-3">
				<a
					href="/edit/{data.page?.metaData.slug}"
					class="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus:bg-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none"
				>
					<svg class="mr-1.5 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
						/>
					</svg>
					Edit Page
				</a>
			</div>
		</div>
	</div>

	<!-- Page Content -->
	<div class="bg-primary ring-border-primary rounded-lg shadow-sm ring-1">
		<article class="prose max-w-none p-8">
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			{@html renderedContent}
		</article>
	</div>

	<!-- Page Actions -->
	<div class="border-primary flex justify-center space-x-4 border-t pt-6">
		<a
			href="/"
			class="bg-secondary text-primary hover:bg-hover focus:bg-hover focus:ring-border-primary inline-flex items-center rounded-md px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-offset-2 focus:outline-none"
		>
			<svg class="mr-1.5 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
				/>
			</svg>
			Back to Home
		</a>

		<a
			href="/pages"
			class="bg-secondary text-primary hover:bg-hover focus:bg-hover focus:ring-border-primary inline-flex items-center rounded-md px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-offset-2 focus:outline-none"
		>
			<svg class="mr-1.5 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"
				/>
			</svg>
			All Pages
		</a>

		<a
			href="/new"
			class="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus:bg-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none"
		>
			<svg class="mr-1.5 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
			</svg>
			New Page
		</a>
	</div>
</div>
