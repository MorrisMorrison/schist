import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	build: {
		rolldownOptions: {
			output: {
				// Rolldown (Vite 8) dropped the object form of manualChunks
				codeSplitting: {
					groups: [
						// UI components chunk
						{ name: 'ui', test: /node_modules\/(@lucide\/svelte|bits-ui)\// }
					]
				}
			}
		}
	}
});
