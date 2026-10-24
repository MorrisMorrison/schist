import { describe, it, expect, vi } from 'vitest';

vi.mock('$lib/api/client', () => ({ apiClient: {} }));

import { markLockedSecretPlaceholders, replaceSecretPlaceholders } from './secrets.svelte';

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
