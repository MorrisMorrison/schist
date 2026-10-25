import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { playwright } from '@vitest/browser-playwright';

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
