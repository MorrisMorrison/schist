import { mdsvex } from 'mdsvex';
import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// SvelteKit 3 takes its options through the sveltekit() Vite plugin and refuses
// to start while a svelte.config.js exists. vite.config.ts and vitest.config.ts
// both pass this object to sveltekit(); eslint.config.js hands it to
// eslint-plugin-svelte.
/** @type {import('@sveltejs/kit/vite').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: [vitePreprocess(), mdsvex()],
	// Force runes mode for our own components only. Libraries in node_modules
	// keep auto-detection; @testing-library/svelte-core ships a legacy-mode
	// scaffold component that fails to compile with runes forced on.
	dynamicCompileOptions: ({ filename }) =>
		filename.split(/[/\\]/).includes('node_modules') ? undefined : { runes: true },
	adapter: adapter({
		pages: 'build',
		assets: 'build',
		fallback: 'index.html',
		precompress: false,
		strict: true
	}),
	extensions: ['.svelte', '.svx']
};

export default config;
