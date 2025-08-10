#!/usr/bin/env node
import { existsSync } from 'fs';
import { rm } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEST_DATA_DIRS = [
	resolve(__dirname, '../../backend/cmd/schist/test-data-worker-1'),
	resolve(__dirname, '../../backend/cmd/schist/test-data-worker-2'),
	resolve(__dirname, '../../backend/cmd/schist/test-data-worker-3'),
	resolve(__dirname, '../../backend/cmd/schist/test-data-worker-4'),
	resolve(__dirname, '../../backend/cmd/schist/test-data-auth-disabled'),
	resolve(__dirname, '../../backend/cmd/schist/test-data-auth-enabled')
];

const TEST_RESULT_DIRS = [
	resolve(__dirname, '../test-results'),
	resolve(__dirname, '../playwright-report')
];

async function cleanupDirectory(dirPath) {
	if (existsSync(dirPath)) {
		console.log(`Cleaning up: ${dirPath}`);
		try {
			await rm(dirPath, { recursive: true, force: true });
			console.log(`Cleaned: ${dirPath}`);
		} catch (error) {
			console.error(`Failed to clean ${dirPath}:`, error.message);
		}
	} else {
		console.log(`Skipping (not found): ${dirPath}`);
	}
}

async function main() {
	console.log('Starting test data cleanup...\n');
	console.log('Cleaning test data directories:');
	for (const dir of TEST_DATA_DIRS) {
		await cleanupDirectory(dir);
	}

	console.log('\nCleaning test result directories:');
	for (const dir of TEST_RESULT_DIRS) {
		await cleanupDirectory(dir);
	}

	console.log('\n Test data cleanup completed!');
}

main().catch((error) => {
	console.error('Cleanup script failed:', error);
	process.exit(1);
});
