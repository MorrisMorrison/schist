import { describe, it, expect, vi } from 'vitest';
import {
	parseError,
	formatErrorForLogging,
	isAuthenticationError,
	isValidationError,
	isNotFoundError,
	createRetryHandler,
	type APIErrorResponse
} from './error';

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

		expect(result.message).toBe('Network connection failed. Please check your internet connection.');
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

		retryableErrors.forEach(error => {
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

		nonRetryableErrors.forEach(error => {
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

describe('formatErrorForLogging', () => {
	it('should format error with context for logging', () => {
		const error = { error: 'Test error', code: 'VALIDATION_ERROR' as const };
		const context = { userId: '123', action: 'create_document' };

		const result = formatErrorForLogging(error, context);
		const parsed = JSON.parse(result);

		expect(parsed.message).toBe('Please check your input and try again.');
		expect(parsed.code).toBe('VALIDATION_ERROR');
		expect(parsed.context).toEqual(context);
		expect(parsed.timestamp).toBeDefined();
	});
});

describe('error type checkers', () => {
	it('should identify authentication errors', () => {
		const authErrors = [
			{ code: 'UNAUTHORIZED' as const },
			'You need to sign in',
			'HTTP 401 error'
		];

		authErrors.forEach(error => {
			expect(isAuthenticationError(error)).toBe(true);
		});

		expect(isAuthenticationError({ code: 'VALIDATION_ERROR' as const })).toBe(false);
	});

	it('should identify validation errors', () => {
		const validationErrors = [
			{ code: 'VALIDATION_ERROR' as const },
			{ code: 'INVALID_REQUEST' as const },
			{ code: 'MISSING_REQUIRED_FIELD' as const }
		];

		validationErrors.forEach(error => {
			expect(isValidationError(error)).toBe(true);
		});

		expect(isValidationError({ code: 'UNAUTHORIZED' as const })).toBe(false);
	});

	it('should identify not found errors', () => {
		expect(isNotFoundError({ code: 'RESOURCE_NOT_FOUND' as const })).toBe(true);
		expect(isNotFoundError({ code: 'VALIDATION_ERROR' as const })).toBe(false);
	});
});

describe('createRetryHandler', () => {
	it('should retry retryable errors', async () => {
		let attemptCount = 0;
		const mockAction = vi.fn(async () => {
			attemptCount++;
			if (attemptCount < 3) {
				throw { code: 'NETWORK_ERROR' };
			}
			return 'success';
		});

		const retryHandler = createRetryHandler(mockAction, 3, 10);
		const result = await retryHandler();

		expect(result).toBe('success');
		expect(mockAction).toHaveBeenCalledTimes(3);
	});

	it('should not retry non-retryable errors', async () => {
		const mockAction = vi.fn(async () => {
			throw { code: 'VALIDATION_ERROR' };
		});

		const retryHandler = createRetryHandler(mockAction, 3, 10);

		await expect(retryHandler()).rejects.toEqual({ code: 'VALIDATION_ERROR' });
		expect(mockAction).toHaveBeenCalledTimes(1);
	});

	it('should throw after max retries', async () => {
		const mockAction = vi.fn(async () => {
			throw { code: 'NETWORK_ERROR' };
		});

		const retryHandler = createRetryHandler(mockAction, 2, 10);

		await expect(retryHandler()).rejects.toEqual({ code: 'NETWORK_ERROR' });
		expect(mockAction).toHaveBeenCalledTimes(2);
	});

	it('should succeed on first try if no error', async () => {
		const mockAction = vi.fn(async () => 'success');

		const retryHandler = createRetryHandler(mockAction, 3, 10);
		const result = await retryHandler();

		expect(result).toBe('success');
		expect(mockAction).toHaveBeenCalledTimes(1);
	});
});