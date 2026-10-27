import { describe, it, expect } from 'vitest';
import { cn } from '#lib/utils.ts';

describe('cn', () => {
	it('joins conditional classes and lets later tailwind classes win', () => {
		const hidden = false;
		expect(cn('p-2', hidden && 'hidden', ['text-sm', { 'font-bold': true }], 'p-4')).toBe(
			'text-sm font-bold p-4'
		);
	});
});
