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

		// `docker compose --profile e2e down` is the complete cleanup. If it fails
		// we just warn — the run has already finished, and the surrounding
		// try/catch keeps teardown best-effort so a cleanup hiccup never fails the
		// suite.
		try {
			const { stdout: dockerStdout } = await execAsync('docker compose --profile e2e down', {
				cwd: dockerComposeDir,
				timeout: 30000
			});
			if (dockerStdout) {
				console.log('[Global Teardown] Docker stop output:', dockerStdout);
			}
		} catch (dockerError) {
			console.warn('[Global Teardown] docker compose down failed:', dockerError);
		}

		console.log('[Global Teardown] Cleanup completed successfully');
	} catch (error) {
		console.warn('[Global Teardown] Cleanup error:', error);
		// Don't fail tests if cleanup fails
	}
}

export default globalTeardown;
