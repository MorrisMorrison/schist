<script lang="ts">
	import Editor from '$lib/components/Editor.svelte';

	// Test content
	const initialContent = `# Welcome to the Markdown Editor

This is a **test** of the markdown editor component.

## Features

- **Bold** and *italic* text
- Headers (H1, H2, H3)
- Lists:
  1. Numbered lists
  2. Bullet lists
- \`inline code\`
- [Links](https://example.com)

> Blockquotes work too!

\`\`\`javascript
// Code blocks
function hello() {
  console.log("Hello, world!");
}
\`\`\`

## Try the editor
Edit this text to test the functionality.`;

	let content = $state(initialContent);

	function handleContentChange(newContent: string) {
		content = newContent;
		console.log('Content changed:', newContent.length, 'characters');
	}

	function handleSave(content: string): Promise<void> {
		console.log('Saving content:', content.length, 'characters');
		// Simulate API call
		return new Promise<void>((resolve) => setTimeout(resolve, 500));
	}
</script>

<svelte:head>
	<title>Markdown Editor Test</title>
</svelte:head>

<div class="flex h-screen flex-col">
	<header class="bg-blue-600 p-4 text-white">
		<h1 class="text-xl font-bold">Markdown Editor Test</h1>
		<p class="text-blue-100">Testing the Schist wiki markdown editor</p>
	</header>

	<main class="flex-1 p-4">
		<div class="h-full">
			<Editor
				initialContent={content}
				onContentChange={handleContentChange}
				onSave={handleSave}
				config={{
					lineNumbers: true,
					autosave: true,
					autosaveInterval: 30000,
					shortcuts: true
				}}
			/>
		</div>
	</main>
</div>
