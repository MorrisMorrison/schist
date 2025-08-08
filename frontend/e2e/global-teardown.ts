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

	// Additional cleanup can be added here
	console.log('[Global Teardown] Cleanup completed');
}

export default globalTeardown;
