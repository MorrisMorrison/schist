import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/api/client', () => ({
	apiClient: {
		getSecretsStatus: vi.fn(),
		listSecrets: vi.fn(),
		lockSecrets: vi.fn(),
		createSecret: vi.fn(),
		getSecret: vi.fn(),
		updateSecret: vi.fn(),
		deleteSecret: vi.fn()
	}
}));

import { apiClient } from '$lib/api/client';
import {
	markLockedSecretPlaceholders,
	parseSecretPlaceholders,
	replaceSecretPlaceholders,
	secretStore
} from './secrets.svelte';

describe('markLockedSecretPlaceholders', () => {
	it('wraps each placeholder in a locked indicator', () => {
		const html = markLockedSecretPlaceholders('token: {{secret:api_key}}');

		expect(html).toContain('class="secret-placeholder');
		expect(html).toContain(`title="Secret 'api_key' is locked.`);
		expect(html).toContain('>{{secret:api_key}} 🔒</span>');
	});

	it('escapes keys so they cannot break out of the attribute or inject markup', () => {
		const html = markLockedSecretPlaceholders(
			'{{secret:x" class="wiki-link" data-wiki-target="/evil}} {{secret:<a href="https://e">y</a>}}'
		);
		const doc = new DOMParser().parseFromString(html, 'text/html');

		expect(doc.querySelectorAll('span')).toHaveLength(2);
		expect(doc.querySelector('a')).toBeNull();
		expect(doc.querySelector('[data-wiki-target]')).toBeNull();
		expect(doc.querySelector('span')!.getAttribute('title')).toContain(
			'x" class="wiki-link" data-wiki-target="/evil'
		);
	});

	it('does not treat $ sequences in keys as replacement patterns', () => {
		const html = markLockedSecretPlaceholders("{{secret:a$&b$'c}}");
		expect(html).toContain('{{secret:a$&amp;b$&#39;c}} 🔒');
	});
});

describe('replaceSecretPlaceholders', () => {
	it('inserts secret values literally, even when they contain $ patterns', async () => {
		const result = await replaceSecretPlaceholders(
			'pw={{secret:db}};',
			async () => "p$&ss$'word$$"
		);
		expect(result).toBe("pw=p$&ss$'word$$;");
	});

	it('replaces repeated placeholders and fetches each key once', async () => {
		const getValue = vi.fn(async (key: string) => `<${key}>`);
		const result = await replaceSecretPlaceholders(
			'{{secret:a}} {{secret: a }} {{secret:b}}',
			getValue
		);

		expect(result).toBe('<a> <a> <b>');
		expect(getValue).toHaveBeenCalledTimes(2);
	});

	it('leaves placeholders whose value cannot be loaded', async () => {
		const result = await replaceSecretPlaceholders('{{secret:a}}', async () => {
			throw new Error('locked');
		});
		expect(result).toBe('{{secret:a}}');
	});
});

describe('parseSecretPlaceholders', () => {
	it('returns each placeholder with its trimmed key', () => {
		expect(parseSecretPlaceholders('a {{secret: db }} b {{secret:api}}')).toEqual([
			{ placeholder: '{{secret: db }}', key: 'db' },
			{ placeholder: '{{secret:api}}', key: 'api' }
		]);
	});
});

describe('secretStore', () => {
	const api = vi.mocked(apiClient);
	const status = {
		unlocked: true,
		has_secrets: true,
		requires_password: false,
		has_passkeys: true,
		requires_setup: false
	} as never;

	beforeEach(() => {
		vi.clearAllMocks();
		secretStore.reset();
		api.getSecretsStatus.mockResolvedValue(status);
		api.listSecrets.mockResolvedValue({ secrets: ['db', 'api'] } as never);
	});

	it('derives flags from the loaded status', async () => {
		expect(secretStore.secretsUnlocked).toBe(false);
		expect(secretStore.requiresSetup).toBe(false);

		await secretStore.loadStatus();

		expect(secretStore.status).toEqual(status);
		expect(secretStore.secretsUnlocked).toBe(true);
		expect(secretStore.hasSecrets).toBe(true);
		expect(secretStore.requiresPassword).toBe(false);
		expect(secretStore.hasPasskeys).toBe(true);
		expect(secretStore.requiresSetup).toBe(false);
	});

	it('lists secret keys without their values', async () => {
		await expect(secretStore.loadSecrets()).resolves.toEqual([
			{ key: 'db', hasValue: true },
			{ key: 'api', hasValue: true }
		]);
		expect(secretStore.secrets).toHaveLength(2);
	});

	it('clears the list when locking and reloads the status', async () => {
		await secretStore.loadSecrets();
		api.lockSecrets.mockResolvedValueOnce({ message: 'locked' });

		await secretStore.lock();

		expect(api.lockSecrets).toHaveBeenCalled();
		expect(api.getSecretsStatus).toHaveBeenCalled();
		expect(secretStore.secrets).toEqual([]);
	});

	it('creates, updates and deletes, reloading what changed', async () => {
		await secretStore.createSecret({ key: 'k', value: 'v' } as never);
		expect(api.createSecret).toHaveBeenCalledWith({ key: 'k', value: 'v' });
		expect(api.listSecrets).toHaveBeenCalledTimes(1);
		expect(api.getSecretsStatus).toHaveBeenCalledTimes(1);

		await secretStore.updateSecret('k', { value: 'w' } as never);
		expect(api.updateSecret).toHaveBeenCalledWith('k', { value: 'w' });
		expect(api.listSecrets).toHaveBeenCalledTimes(2);

		await secretStore.deleteSecret('k');
		expect(api.deleteSecret).toHaveBeenCalledWith('k');
		expect(api.listSecrets).toHaveBeenCalledTimes(3);
		expect(api.getSecretsStatus).toHaveBeenCalledTimes(2);
	});

	it('returns a single secret value', async () => {
		api.getSecret.mockResolvedValueOnce({ key: 'db', value: 's3cret' } as never);

		await expect(secretStore.getSecret('db')).resolves.toBe('s3cret');
		expect(api.getSecret).toHaveBeenCalledWith('db');
	});

	it('records the API error message and resets loading', async () => {
		api.createSecret.mockRejectedValueOnce(
			new Error(JSON.stringify({ error: 'Secret already exists', code: 'RESOURCE_ALREADY_EXISTS' }))
		);

		await expect(secretStore.createSecret({ key: 'k', value: 'v' } as never)).rejects.toThrow();

		expect(secretStore.error).toBe('Secret already exists');
		expect(secretStore.loading).toBe(false);
		secretStore.clearError();
		expect(secretStore.error).toBeNull();
	});
});
