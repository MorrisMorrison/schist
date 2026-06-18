export type ErrorCode =
	| 'VALIDATION_ERROR'
	| 'INVALID_PATH'
	| 'INVALID_REQUEST'
	| 'MISSING_REQUIRED_FIELD'
	| 'RESOURCE_NOT_FOUND'
	| 'RESOURCE_ALREADY_EXISTS'
	| 'RESOURCE_CONFLICT'
	| 'UNAUTHORIZED'
	| 'FORBIDDEN'
	| 'INTERNAL_ERROR'
	| 'DATABASE_ERROR'
	| 'FILESYSTEM_ERROR'
	| 'NETWORK_ERROR'
	| 'TIMEOUT_ERROR'
	| 'RATE_LIMITED'
	| 'SERVICE_UNAVAILABLE'
	| 'OPERATION_FAILED'
	| 'INVALID_STATE';

export interface APIErrorResponse {
	error: string;
	code?: ErrorCode;
	details?: Record<string, unknown>;
}

export interface ParsedError {
	message: string;
	code?: ErrorCode;
	details?: Record<string, unknown>;
	isRetryable: boolean;
	severity: 'error' | 'warning' | 'info';
}

/**
 * Returns the message of an Error, or the provided fallback for non-Error values.
 */
export function getErrorMessage(error: unknown, fallback: string): string {
	return error instanceof Error ? error.message : fallback;
}

export function parseError(error: unknown): ParsedError {
	if (error instanceof Response) {
		return {
			message: getStatusMessage(error.status),
			code: getErrorCodeFromStatus(error.status),
			isRetryable: isRetryableStatus(error.status),
			severity: getSeverityFromStatus(error.status)
		};
	}

	if (error instanceof Error) {
		try {
			const apiError = JSON.parse(error.message) as APIErrorResponse;
			if (apiError.error) {
				return {
					message: getUserFriendlyMessage(apiError.error, apiError.code),
					code: apiError.code,
					details: apiError.details,
					isRetryable: isRetryableError(apiError.code),
					severity: getSeverityFromCode(apiError.code)
				};
			}
		} catch {
			// Not a JSON error, use the error message directly
		}

		return {
			message: getUserFriendlyMessage(error.message),
			isRetryable: false,
			severity: 'error'
		};
	}

	if (typeof error === 'string') {
		return {
			message: getUserFriendlyMessage(error),
			isRetryable: false,
			severity: 'error'
		};
	}

	if (error && typeof error === 'object' && 'code' in error) {
		const errorObj = error as {
			code?: ErrorCode;
			error?: string;
			details?: Record<string, unknown>;
		};
		return {
			message: getUserFriendlyMessage(errorObj.error || 'An error occurred', errorObj.code),
			code: errorObj.code,
			details: errorObj.details,
			isRetryable: isRetryableError(errorObj.code),
			severity: getSeverityFromCode(errorObj.code)
		};
	}

	if (error && typeof error === 'object' && 'error' in error) {
		const errorObj = error as APIErrorResponse;
		return {
			message: getUserFriendlyMessage(errorObj.error, errorObj.code),
			code: errorObj.code,
			details: errorObj.details,
			isRetryable: isRetryableError(errorObj.code),
			severity: getSeverityFromCode(errorObj.code)
		};
	}

	return {
		message: 'An unexpected error occurred. Please try again.',
		isRetryable: true,
		severity: 'error'
	};
}

function isUserFriendlyMessage(message: string): boolean {
	return (
		message.length > 10 &&
		!message.toLowerCase().includes('error:') &&
		!message.includes('Error:') &&
		!message.includes('HTTP ')
	);
}

function getUserFriendlyMessage(message: string, code?: ErrorCode): string {
	if (code) {
		switch (code) {
			case 'VALIDATION_ERROR':
				return 'Please check your input and try again.';
			case 'INVALID_PATH':
				return 'The specified path is invalid.';
			case 'RESOURCE_NOT_FOUND':
				return 'The requested item could not be found.';
			case 'RESOURCE_ALREADY_EXISTS':
				return 'An item with that name already exists.';
			case 'UNAUTHORIZED':
				return 'You need to sign in to perform this action.';
			case 'FORBIDDEN':
				return 'You do not have permission to perform this action.';
			case 'NETWORK_ERROR':
				return 'Network connection failed. Please check your internet connection.';
			case 'TIMEOUT_ERROR':
				return 'The request timed out. Please try again.';
			case 'RATE_LIMITED':
				return 'Too many requests. Please wait a moment and try again.';
			case 'SERVICE_UNAVAILABLE':
				return 'The service is temporarily unavailable. Please try again later.';
			case 'DATABASE_ERROR':
			case 'FILESYSTEM_ERROR':
			case 'INTERNAL_ERROR':
				return 'A server error occurred. Please try again or contact support.';
		}
	}

	if (message.toLowerCase().includes('network')) {
		return 'Network connection failed. Please check your internet connection.';
	}

	if (message.toLowerCase().includes('timeout')) {
		return 'The request timed out. Please try again.';
	}

	if (message.toLowerCase().includes('not found')) {
		return 'The requested item could not be found.';
	}

	if (message.toLowerCase().includes('already exists')) {
		return 'An item with that name already exists.';
	}

	if (message.toLowerCase().includes('unauthorized') || message.includes('401')) {
		return 'You need to sign in to perform this action.';
	}

	if (message.toLowerCase().includes('forbidden') || message.includes('403')) {
		return 'You do not have permission to perform this action.';
	}

	if (isUserFriendlyMessage(message)) {
		return message;
	}

	return 'An error occurred. Please try again.';
}

function getStatusMessage(status: number): string {
	switch (status) {
		case 400:
			return 'Invalid request. Please check your input.';
		case 401:
			return 'You need to sign in to perform this action.';
		case 403:
			return 'You do not have permission to perform this action.';
		case 404:
			return 'The requested item could not be found.';
		case 409:
			return 'A conflict occurred. The item may already exist.';
		case 422:
			return 'The request could not be processed. Please check your input.';
		case 429:
			return 'Too many requests. Please wait a moment and try again.';
		case 500:
			return 'A server error occurred. Please try again.';
		case 502:
		case 503:
		case 504:
			return 'The service is temporarily unavailable. Please try again later.';
		default:
			return 'An unexpected error occurred. Please try again.';
	}
}

export function getErrorCodeFromStatus(status: number): ErrorCode | undefined {
	switch (status) {
		case 400:
			return 'VALIDATION_ERROR';
		case 401:
			return 'UNAUTHORIZED';
		case 403:
			return 'FORBIDDEN';
		case 404:
			return 'RESOURCE_NOT_FOUND';
		case 409:
			return 'RESOURCE_CONFLICT';
		case 408:
			return 'TIMEOUT_ERROR';
		case 429:
			return 'RATE_LIMITED';
		case 500:
			return 'INTERNAL_ERROR';
		case 502:
		case 503:
		case 504:
			return 'SERVICE_UNAVAILABLE';
		default:
			return undefined;
	}
}

function isRetryableStatus(status: number): boolean {
	return status >= 500 || status === 408 || status === 429;
}

function isRetryableError(code?: ErrorCode): boolean {
	if (!code) return false;

	const retryableErrors: ErrorCode[] = [
		'NETWORK_ERROR',
		'TIMEOUT_ERROR',
		'RATE_LIMITED',
		'SERVICE_UNAVAILABLE',
		'INTERNAL_ERROR',
		'DATABASE_ERROR',
		'FILESYSTEM_ERROR'
	];

	return retryableErrors.includes(code);
}

function getSeverityFromStatus(status: number): 'error' | 'warning' | 'info' {
	if (status >= 500) return 'error';
	if (status === 401 || status === 403) return 'warning';
	if (status >= 400) return 'warning';
	return 'info';
}

function getSeverityFromCode(code?: ErrorCode): 'error' | 'warning' | 'info' {
	if (!code) return 'error';

	const warningCodes: ErrorCode[] = [
		'VALIDATION_ERROR',
		'INVALID_REQUEST',
		'RESOURCE_NOT_FOUND',
		'RESOURCE_ALREADY_EXISTS',
		'UNAUTHORIZED',
		'FORBIDDEN'
	];

	const errorCodes: ErrorCode[] = [
		'INTERNAL_ERROR',
		'DATABASE_ERROR',
		'FILESYSTEM_ERROR',
		'SERVICE_UNAVAILABLE'
	];

	if (errorCodes.includes(code)) return 'error';
	if (warningCodes.includes(code)) return 'warning';
	return 'info';
}

export function isNotFoundError(error: unknown): boolean {
	const parsed = parseError(error);
	return parsed.code === 'RESOURCE_NOT_FOUND';
}
