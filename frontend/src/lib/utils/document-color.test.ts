import { describe, it, expect } from 'vitest';
import { getDocumentColor } from './document-color';

describe('getDocumentColor', () => {
	it('picks a colour from the first keyword in the title, case-insensitively', () => {
		expect(getDocumentColor('API Reference')).toBe('from-blue-500/90 to-blue-600/90');
		expect(getDocumentColor('Env Config')).toBe('from-orange-500/90 to-orange-600/90');
		expect(getDocumentColor('UI kit')).toBe('from-pink-500/90 to-pink-600/90');
		expect(getDocumentColor('Tutorial: setup')).toBe('from-green-500/90 to-green-600/90');
		expect(getDocumentColor('Meeting notes')).toBe('from-teal-500/90 to-teal-600/90');
		expect(getDocumentColor('Security review')).toBe('from-red-500/90 to-red-600/90');
	});

	it('falls back to slate', () => {
		expect(getDocumentColor('Groceries')).toBe('from-slate-500/90 to-slate-600/90');
	});
});
