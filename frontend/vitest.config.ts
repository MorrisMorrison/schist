import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { playwright } from '@vitest/browser-playwright';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	// Pre-bundle the dependencies that test files only reach lazily. Otherwise
	// Vite discovers them mid-run, re-optimizes and reloads the page while a
	// test file is running; the reloaded bits-ui chunk then talks to a second
	// copy of the Svelte runtime ("Cannot read properties of null (reading 'f')").
	optimizeDeps: {
		include: [
			'bits-ui',
			'@lucide/svelte',
			'@lucide/svelte/icons/x',
			'@lucide/svelte/icons/check',
			'@lucide/svelte/icons/chevron-down',
			'@lucide/svelte/icons/chevron-up',
			'@lucide/svelte/icons/circle',
			'clsx',
			'tailwind-merge',
			'tailwind-variants',
			'marked',
			'dompurify',
			'highlight.js/lib/core',
			'd3',
			'codemirror',
			'@codemirror/state',
			'@codemirror/view',
			'@codemirror/language',
			'@codemirror/autocomplete',
			'@codemirror/lang-markdown',
			'@lezer/highlight'
		]
	},
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
			provider: playwright(),
			instances: [{ browser: 'chromium' }],
			headless: true
		},
		globals: true,
		setupFiles: ['src/lib/test/setup.ts'],
		coverage: {
			include: ['src/lib/**/*.{ts,svelte}'],
			exclude: ['src/lib/test/**', '**/*.test.ts', '**/*.d.ts', 'src/lib/types/**']
		}
	},
	// Ensure Svelte components can be tested in browser-like environment
	ssr: {
		noExternal: ['@testing-library/svelte']
	}
});
