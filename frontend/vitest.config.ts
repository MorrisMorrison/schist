import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}'],
		exclude: ['e2e/**/*', 'node_modules/**/*'],
		// Run test files one at a time. Browser-mode tests each drive a headless
		// Chromium; the default file-parallelism launches several at once and
		// spikes CPU on the shared self-hosted runner. Serial files keep one
		// browser alive at a time (lower peak CPU, modestly slower wall-clock).
		fileParallelism: false,
		browser: {
			enabled: true,
			name: 'chromium',
			provider: 'playwright',
			headless: true
		},
		globals: true,
		setupFiles: ['src/lib/test/setup.ts'],
		coverage: {
			include: ['src/lib/components/**/*.svelte', 'src/lib/utils/**/*.ts'],
			exclude: ['src/lib/test/**/*']
		}
	},
	// Ensure Svelte components can be tested in browser-like environment
	ssr: {
		noExternal: ['@testing-library/svelte']
	}
});
