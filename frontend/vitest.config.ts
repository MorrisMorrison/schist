import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}'],
		exclude: ['e2e/**/*', 'node_modules/**/*'],
		browser: {
			enabled: true,
			name: 'chromium',
			provider: 'playwright'
		},
		environment: 'happy-dom',
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
