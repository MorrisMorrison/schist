import { defineConfig, devices } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Generates the README screenshots: boots the real backend (serving the built
// frontend) against a fresh, empty data dir, seeds a small demo wiki through the
// API and captures the key screens in light and dark. Run with `make screenshots`
// (or `npm run screenshots` here after building the frontend). Separate from the
// e2e config so the two never interfere: no Docker, no auth, its own port.
const PORT = process.env.SCREENSHOTS_PORT ?? '8099';
const BASE = `http://localhost:${PORT}`;
const ROOT = resolve(__dirname, '..');

// A prebuilt binary (CI) or `go run` (local).
const command = process.env.SCHIST_BIN
	? `"${resolve(process.env.SCHIST_BIN)}"`
	: 'go run ./cmd/schist';

export default defineConfig({
	testDir: './readme-screenshots',
	fullyParallel: false,
	workers: 1,
	retries: process.env.CI ? 1 : 0,
	reporter: 'list',
	timeout: 120_000,
	use: {
		baseURL: BASE,
		...devices['Desktop Chrome'],
		viewport: { width: 1440, height: 900 },
		deviceScaleFactor: 1
	},
	webServer: {
		command,
		cwd: join(ROOT, 'backend'),
		url: `${BASE}/api/health`,
		reuseExistingServer: false,
		timeout: 180_000,
		env: {
			// production: the binary only serves the SPA outside development mode.
			ENV: 'production',
			SCHIST_JWT_SECRET: 'readme-screenshots-only-not-a-real-secret',
			SCHIST_PORT: PORT,
			SCHIST_DATA_DIR: mkdtempSync(join(tmpdir(), 'schist-screenshots-')),
			SCHIST_STATIC_DIR: join(ROOT, 'frontend', 'build'),
			SCHIST_TEMPLATES_DIR: join(ROOT, 'templates'),
			SCHIST_FRONTEND_URL: BASE,
			SCHIST_AUTH_ENABLED: 'false',
			SCHIST_RATE_LIMIT_ENABLED: 'false',
			SCHIST_HSTS_ENABLED: 'false'
		},
		stdout: 'pipe',
		stderr: 'pipe'
	}
});
