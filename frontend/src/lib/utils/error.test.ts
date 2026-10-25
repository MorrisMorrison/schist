import { describe, it, expect } from 'vitest';
import { parseError, isNotFoundError, getErrorMessage, type APIErrorResponse } from './error';

describe('parseError', () => {
	it('should parse API error responses correctly', () => {
		const apiError: APIErrorResponse = {
			error: 'Document not found',
			code: 'RESOURCE_NOT_FOUND',
			details: { path: '/test' }
		};

		const result = parseError(apiError);

		expect(result.message).toBe('The requested item could not be found.');
		expect(result.code).toBe('RESOURCE_NOT_FOUND');
		expect(result.details).toEqual({ path: '/test' });
		expect(result.isRetryable).toBe(false);
		expect(result.severity).toBe('warning');
	});

	it('should parse Error objects with JSON message', () => {
		const apiError: APIErrorResponse = {
			error: 'Validation failed',
			code: 'VALIDATION_ERROR'
		};
		const error = new Error(JSON.stringify(apiError));

		const result = parseError(error);

		expect(result.message).toBe('Please check your input and try again.');
		expect(result.code).toBe('VALIDATION_ERROR');
		expect(result.severity).toBe('warning');
	});

	it('should parse Error objects with plain message', () => {
		const error = new Error('Network connection failed');

		const result = parseError(error);

		expect(result.message).toBe(
			'Network connection failed. Please check your internet connection.'
		);
		expect(result.isRetryable).toBe(false);
		expect(result.severity).toBe('error');
	});

	it('should parse Response objects', () => {
		const response = new Response('Not found', { status: 404 });

		const result = parseError(response);

		expect(result.message).toBe('The requested item could not be found.');
		expect(result.code).toBe('RESOURCE_NOT_FOUND');
		expect(result.isRetryable).toBe(false);
		expect(result.severity).toBe('warning');
	});

	it('should parse string errors', () => {
		const error = 'Something went wrong';

		const result = parseError(error);

		expect(result.message).toBe('Something went wrong'); // User-friendly message should be preserved
		expect(result.isRetryable).toBe(false);
		expect(result.severity).toBe('error');
	});

	it('should handle unknown error types', () => {
		const result = parseError({ unknown: 'error' });

		expect(result.message).toBe('An unexpected error occurred. Please try again.');
		expect(result.isRetryable).toBe(true);
		expect(result.severity).toBe('error');
	});

	it('should handle null/undefined errors', () => {
		const result = parseError(null);

		expect(result.message).toBe('An unexpected error occurred. Please try again.');
		expect(result.isRetryable).toBe(true);
		expect(result.severity).toBe('error');
	});
});

describe('user-friendly messages', () => {
	it('should convert technical error messages to user-friendly ones', () => {
		const testCases = [
			{
				input: 'Document already exists in database',
				expected: 'An item with that name already exists.'
			},
			{
				input: 'Connection timeout after 5000ms',
				expected: 'The request timed out. Please try again.'
			},
			{
				input: 'HTTP 401: Unauthorized access',
				expected: 'You need to sign in to perform this action.'
			},
			{
				input: 'Resource not found in system',
				expected: 'The requested item could not be found.'
			}
		];

		testCases.forEach(({ input, expected }) => {
			const result = parseError(input);
			expect(result.message).toBe(expected);
		});
	});

	it('should preserve already user-friendly messages', () => {
		const friendlyMessage = 'Your document has been saved successfully';
		const result = parseError(friendlyMessage);
		expect(result.message).toBe(friendlyMessage);
	});
});

describe('error classification', () => {
	it('should correctly identify retryable errors', () => {
		const retryableErrors = [
			{ code: 'NETWORK_ERROR' as const },
			{ code: 'TIMEOUT_ERROR' as const },
			{ code: 'SERVICE_UNAVAILABLE' as const },
			{ code: 'INTERNAL_ERROR' as const }
		];

		retryableErrors.forEach((error) => {
			const result = parseError(error);
			expect(result.isRetryable).toBe(true);
		});
	});

	it('should correctly identify non-retryable errors', () => {
		const nonRetryableErrors = [
			{ code: 'VALIDATION_ERROR' as const },
			{ code: 'UNAUTHORIZED' as const },
			{ code: 'RESOURCE_NOT_FOUND' as const }
		];

		nonRetryableErrors.forEach((error) => {
			const result = parseError(error);
			expect(result.isRetryable).toBe(false);
		});
	});

	it('should assign correct severity levels', () => {
		const testCases = [
			{ code: 'INTERNAL_ERROR' as const, expectedSeverity: 'error' as const },
			{ code: 'VALIDATION_ERROR' as const, expectedSeverity: 'warning' as const },
			{ code: 'UNAUTHORIZED' as const, expectedSeverity: 'warning' as const },
			{ code: 'TIMEOUT_ERROR' as const, expectedSeverity: 'info' as const }
		];

		testCases.forEach(({ code, expectedSeverity }) => {
			const result = parseError({ code });
			expect(result.severity).toBe(expectedSeverity);
		});
	});
});

describe('error type checkers', () => {
	it('should identify not found errors', () => {
		expect(isNotFoundError({ code: 'RESOURCE_NOT_FOUND' as const })).toBe(true);
		expect(isNotFoundError({ code: 'VALIDATION_ERROR' as const })).toBe(false);
	});
});

describe('getErrorMessage', () => {
	it('returns the envelope text for API client errors instead of raw JSON', () => {
		const error = new Error(
			JSON.stringify({ error: 'Folder name is invalid', code: 'VALIDATION_ERROR' })
		);
		expect(getErrorMessage(error, 'fallback')).toBe('Folder name is invalid');
	});

	it('falls back when the envelope has an empty message', () => {
		const error = new Error(JSON.stringify({ error: '', code: 'INTERNAL_ERROR' }));
		expect(getErrorMessage(error, 'fallback')).toBe('fallback');
	});

	it('returns plain error messages unchanged', () => {
		expect(getErrorMessage(new Error('Copy failed: denied'), 'fallback')).toBe(
			'Copy failed: denied'
		);
		expect(getErrorMessage(new Error('{not json'), 'fallback')).toBe('{not json');
	});

	it('returns the fallback for non-Error values', () => {
		expect(getErrorMessage('boom', 'fallback')).toBe('fallback');
		expect(getErrorMessage(undefined, 'fallback')).toBe('fallback');
	});
});
