/**
 * Modern clipboard utilities with fallback support
 */

export interface CopyResult {
	success: boolean;
	error?: string;
}

/**
 * Copy text to clipboard using modern Clipboard API with fallback
 */
export async function copyToClipboard(text: string): Promise<CopyResult> {
	// Modern Clipboard API (preferred)
	if (navigator.clipboard && window.isSecureContext) {
		try {
			await navigator.clipboard.writeText(text);
			return { success: true };
		} catch (error) {
			console.warn('Clipboard API failed, trying fallback:', error);
			// Fall through to fallback method
		}
	}

	// Fallback method using execCommand
	return copyToClipboardFallback(text);
}

/**
 * Fallback clipboard copy using document.execCommand
 */
function copyToClipboardFallback(text: string): CopyResult {
	try {
		// Create a temporary textarea element
		const textarea = document.createElement('textarea');
		textarea.value = text;
		textarea.style.position = 'fixed';
		textarea.style.left = '-999999px';
		textarea.style.top = '-999999px';
		document.body.appendChild(textarea);

		// Select and copy the text
		textarea.focus();
		textarea.select();

		const successful = document.execCommand('copy');
		document.body.removeChild(textarea);

		if (successful) {
			return { success: true };
		} else {
			return {
				success: false,
				error: 'Copy command failed'
			};
		}
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown copy error'
		};
	}
}

/**
 * Check if clipboard functionality is available
 */
export function isClipboardSupported(): boolean {
	return (
		(navigator.clipboard && window.isSecureContext) ||
		document.queryCommandSupported?.('copy') ||
		false
	);
}

/**
 * Request clipboard permissions (for modern API)
 */
export async function requestClipboardPermission(): Promise<boolean> {
	if (!navigator.permissions || !navigator.clipboard) {
		return false;
	}

	try {
		const permission = await navigator.permissions.query({
			name: 'clipboard-write' as PermissionName
		});
		return permission.state === 'granted' || permission.state === 'prompt';
	} catch (error) {
		console.warn('Could not check clipboard permissions:', error);
		return false;
	}
}
