import { promises as fs } from 'fs';
import path from 'path';

async function globalTeardown() {
	console.log('[Global Teardown] Starting cleanup...');

	// Clean up auth file
	const authFile = path.join(process.cwd(), 'playwright', '.auth', 'user.json');
	try {
		await fs.unlink(authFile);
		console.log('[Global Teardown] Removed user.json auth file');
	} catch {
		// File might not exist, which is fine
		console.log("[Global Teardown] Auth file already removed or doesn't exist");
	}

	// Clean up test databases
	try {
		const testDirs = [
			'../backend/cmd/schist/test-data-auth-disabled',
			'../backend/cmd/schist/test-data-auth-enabled'
		];

		for (const dir of testDirs) {
			const fullPath = path.resolve(process.cwd(), dir);
			try {
				await fs.rm(fullPath, { recursive: true, force: true });
				console.log(`[Global Teardown] Removed test database: ${dir}`);
			} catch (error) {
				console.log(`[Global Teardown] Could not remove ${dir} (might not exist):`, error);
			}
		}
	} catch (error) {
		console.warn('[Global Teardown] Database cleanup error:', error);
	}

	console.log('[Global Teardown] Cleanup completed');
}

export default globalTeardown;
