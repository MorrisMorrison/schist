import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	build: {
		rollupOptions: {
			output: {
				manualChunks: (id) => {
					// Core libraries chunk
					if (id.includes('node_modules')) {
						// CodeMirror chunk for editor-specific functionality
						if (id.includes('codemirror')) {
							return 'codemirror';
						}
						// Markdown processing chunk (marked library and related utilities)
						if (id.includes('marked') || id.includes('highlight.js') || id.includes('dompurify')) {
							return 'markdown';
						}
						// D3 visualization chunk
						if (id.includes('d3')) {
							return 'd3';
						}
						// UI components chunk
						if (id.includes('@lucide/svelte') || id.includes('bits-ui')) {
							return 'ui';
						}
						// WebAuthn chunk for authentication
						if (id.includes('webauthn') || id.includes('passkey')) {
							return 'webauthn';
						}
						// Other vendor libraries
						return 'vendor';
					}
					
					// Application chunks by feature area
					if (id.includes('/lib/components/editor/')) {
						return 'editor';
					}
					if (id.includes('/lib/components/markdown/') && !id.includes('LazyMarkdownRenderer')) {
						return 'markdown';
					}
					if (id.includes('/lib/components/document/DocumentGraphView')) {
						return 'd3';
					}
					if (id.includes('/lib/components/modal/')) {
						return 'modals';
					}
				}
			}
		}
	}
});
