import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

async function globalTeardown() {
	console.log('[Global Teardown] Starting cleanup...');

	try {
		// Stop Docker containers first
		console.log('[Global Teardown] Stopping Docker containers...');
		const dockerComposeDir = path.resolve(process.cwd(), '..');
		const { stdout: dockerStdout, stderr: dockerStderr } = await execAsync(
			'docker-compose --profile e2e down',
			{ cwd: dockerComposeDir }
		);

		if (dockerStdout) {
			console.log('[Global Teardown] Docker stop output:', dockerStdout);
		}
		if (dockerStderr) {
			console.warn('[Global Teardown] Docker stop warnings:', dockerStderr);
		}

		// Use the unified cleanup script with e2e-only profile
		// In CI, we run from frontend directory, so we need to go up one level
		const cleanupScript = path.resolve(process.cwd(), '../scripts/cleanup.sh');
		const { stdout, stderr } = await execAsync(`"${cleanupScript}" --profile=e2e-only`);

		if (stdout) {
			console.log('[Global Teardown] Cleanup output:', stdout);
		}
		if (stderr) {
			console.warn('[Global Teardown] Cleanup warnings:', stderr);
		}

		console.log('[Global Teardown] Cleanup completed successfully');
	} catch (error) {
		console.warn('[Global Teardown] Cleanup error:', error);
		// Don't fail tests if cleanup fails
	}
}

export default globalTeardown;
