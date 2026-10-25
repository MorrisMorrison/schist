import { mdsvex } from 'mdsvex';
import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: [vitePreprocess(), mdsvex()],
	// Force runes mode for our own components only. Libraries in node_modules
	// keep auto-detection; @testing-library/svelte-core ships a legacy-mode
	// scaffold component that fails to compile with runes forced on.
	vitePlugin: {
		dynamicCompileOptions: ({ filename }) =>
			filename.split(/[/\\]/).includes('node_modules') ? undefined : { runes: true }
	},
	kit: {
		adapter: adapter({
			pages: 'build',
			assets: 'build',
			fallback: 'index.html',
			precompress: false,
			strict: true
		})
	},
	extensions: ['.svelte', '.svx']
};

export default config;
