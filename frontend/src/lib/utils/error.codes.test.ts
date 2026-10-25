import { describe, it, expect } from 'vitest';
import { getErrorCodeFromStatus, isUnauthorizedError, parseError, type ErrorCode } from './error';

const envelope = (error: string, code?: ErrorCode) => new Error(JSON.stringify({ error, code }));

describe('parseError by code', () => {
	it.each([
		['VALIDATION_ERROR', 'Please check your input and try again.', 'warning', false],
		['INVALID_PATH', 'The specified path is invalid.', 'info', false],
		['RESOURCE_ALREADY_EXISTS', 'An item with that name already exists.', 'warning', false],
		['UNAUTHORIZED', 'You need to sign in to perform this action.', 'warning', false],
		['FORBIDDEN', 'You do not have permission to perform this action.', 'warning', false],
		[
			'NETWORK_ERROR',
			'Network connection failed. Please check your internet connection.',
			'info',
			true
		],
		['TIMEOUT_ERROR', 'The request timed out. Please try again.', 'info', true],
		['RATE_LIMITED', 'Too many requests. Please wait a moment and try again.', 'info', true],
		[
			'SERVICE_UNAVAILABLE',
			'The service is temporarily unavailable. Please try again later.',
			'error',
			true
		],
		[
			'DATABASE_ERROR',
			'A server error occurred. Please try again or contact support.',
			'error',
			true
		],
		[
			'FILESYSTEM_ERROR',
			'A server error occurred. Please try again or contact support.',
			'error',
			true
		]
	] as const)('%s', (code, message, severity, retryable) => {
		const parsed = parseError(envelope('raw backend text', code));

		expect(parsed.message).toBe(message);
		expect(parsed.code).toBe(code);
		expect(parsed.severity).toBe(severity);
		expect(parsed.isRetryable).toBe(retryable);
	});

	it('keeps the server text for codes without a canned message', () => {
		expect(parseError(envelope('Repository is in a bad state', 'INVALID_STATE')).message).toBe(
			'Repository is in a bad state'
		);
	});
});

describe('parseError for plain messages', () => {
	it.each([
		['Request timeout after 30s', 'The request timed out. Please try again.'],
		['Page not found', 'The requested item could not be found.'],
		['Folder already exists', 'An item with that name already exists.'],
		['got 401', 'You need to sign in to perform this action.'],
		['Forbidden by policy', 'You do not have permission to perform this action.'],
		['HTTP 500', 'An error occurred. Please try again.']
	])('%s', (raw, message) => {
		expect(parseError(raw).message).toBe(message);
	});
});

describe('parseError for objects and responses', () => {
	it('reads code-only and error-only objects', () => {
		expect(parseError({ code: 'FORBIDDEN', details: { a: 1 } })).toMatchObject({
			message: 'You do not have permission to perform this action.',
			code: 'FORBIDDEN',
			details: { a: 1 }
		});
		expect(parseError({ code: 'INVALID_STATE' }).message).toBe('An error occurred');
		expect(parseError({ error: 'Something specific went wrong' })).toMatchObject({
			message: 'Something specific went wrong',
			severity: 'error',
			isRetryable: false
		});
	});

	it.each([
		[400, 'Invalid request. Please check your input.', 'warning', false],
		[403, 'You do not have permission to perform this action.', 'warning', false],
		[409, 'A conflict occurred. The item may already exist.', 'warning', false],
		[422, 'The request could not be processed. Please check your input.', 'warning', false],
		[429, 'Too many requests. Please wait a moment and try again.', 'warning', true],
		[500, 'A server error occurred. Please try again.', 'error', true],
		[502, 'The service is temporarily unavailable. Please try again later.', 'error', true],
		[302, 'An unexpected error occurred. Please try again.', 'info', false]
	] as const)('maps a %i response', (status, message, severity, retryable) => {
		const parsed = parseError(new Response(null, { status: status === 302 ? 200 : status }));
		if (status === 302) {
			// 2xx/3xx Responses aren't errors; any non-4xx/5xx status reads as info.
			expect(parsed.severity).toBe('info');
			return;
		}
		expect(parsed.message).toBe(message);
		expect(parsed.severity).toBe(severity);
		expect(parsed.isRetryable).toBe(retryable);
	});
});

describe('status and type helpers', () => {
	it('maps statuses to codes', () => {
		expect(getErrorCodeFromStatus(408)).toBe('TIMEOUT_ERROR');
		expect(getErrorCodeFromStatus(504)).toBe('SERVICE_UNAVAILABLE');
		expect(getErrorCodeFromStatus(418)).toBeUndefined();
	});

	it('detects unauthorized API errors', () => {
		expect(isUnauthorizedError(envelope('expired', 'UNAUTHORIZED'))).toBe(true);
		expect(isUnauthorizedError(envelope('down', 'SERVICE_UNAVAILABLE'))).toBe(false);
	});
});
