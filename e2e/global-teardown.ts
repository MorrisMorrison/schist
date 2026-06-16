import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

async function globalTeardown() {
	console.log('[Global Teardown] Starting cleanup...');

	try {
		// The e2e backend runs entirely inside the Docker container (no host volume),
		// so stopping/removing the container is the complete cleanup — there is no
		// leftover test data on the host to scrub.
		console.log('[Global Teardown] Stopping Docker containers...');
		const dockerComposeDir = path.resolve(process.cwd(), '..');

		// Try docker compose down first
		try {
			const { stdout: dockerStdout } = await execAsync('docker compose --profile e2e down', {
				cwd: dockerComposeDir,
				timeout: 30000
			});
			if (dockerStdout) {
				console.log('[Global Teardown] Docker stop output:', dockerStdout);
			}
		} catch (_dockerError) {
			console.warn('[Global Teardown] docker compose down failed, trying manual cleanup...');

			// Fallback: stop and remove containers manually
			try {
				await execAsync('docker stop $(docker ps -q --filter "name=schist") 2>/dev/null || true');
				await execAsync('docker rm $(docker ps -aq --filter "name=schist") 2>/dev/null || true');
				console.log('[Global Teardown] Manual Docker cleanup completed');
			} catch (manualError) {
				console.warn('[Global Teardown] Manual Docker cleanup also failed:', manualError);
			}
		}

		console.log('[Global Teardown] Cleanup completed successfully');
	} catch (error) {
		console.warn('[Global Teardown] Cleanup error:', error);
		// Don't fail tests if cleanup fails
	}
}

export default globalTeardown;
