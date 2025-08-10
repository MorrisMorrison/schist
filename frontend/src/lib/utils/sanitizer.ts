import DOMPurify from 'dompurify';

// Minimal configuration for component-based rendering
// Components only need to sanitize inline content, not structural elements
const componentSanitizerConfig = {
	ALLOWED_TAGS: [
		// Basic inline formatting
		'strong',
		'em',
		'i',
		'b',
		'u',
		'code',
		'span',
		'a',
		// Line breaks (sometimes needed in component text)
		'br'
	],
	ALLOWED_ATTR: [
		'class',
		'href',
		'target',
		'data-wiki-target' // For wiki links
	],
	ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
	FORBID_TAGS: ['script', 'object', 'embed', 'form', 'input', 'textarea', 'select'],
	FORBID_ATTR: [
		'onclick',
		'onload',
		'onerror',
		'onmouseover',
		'onfocus',
		'onblur',
		'onchange',
		'onsubmit',
		'onmouseenter',
		'onmouseleave'
	],
	KEEP_CONTENT: true,
	RETURN_DOM_FRAGMENT: false,
	RETURN_DOM: false,
	SANITIZE_DOM: true,
	WHOLE_DOCUMENT: false
};

/**
 * Sanitizes HTML content for use in component-based markdown rendering.
 * This is a lightweight sanitizer that only handles inline content since
 * structural elements are controlled by Svelte components.
 */
export function sanitizeHtml(dirty: string): string {
	if (!dirty || typeof dirty !== 'string') {
		return '';
	}

	try {
		return DOMPurify.sanitize(dirty, componentSanitizerConfig);
	} catch (error) {
		console.error('HTML sanitization failed:', error);
		return '';
	}
}

// Legacy function - kept for backward compatibility if needed
// TODO: Remove this once all usage is migrated to component-based rendering
export function sanitizeMarkdownHtml(html: string): string {
	console.warn('sanitizeMarkdownHtml is deprecated - migrate to component-based rendering');
	return sanitizeHtml(html);
}
