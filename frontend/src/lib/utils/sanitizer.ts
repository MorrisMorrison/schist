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
		'br',
		// Images
		'img'
	],
	ALLOWED_ATTR: [
		'class',
		'href',
		'target',
		'data-wiki-target',
		'data-testid',
		'src',
		'alt',
		'title',
		'width',
		'height',
		'loading'
	],
	ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
	FORBID_TAGS: ['script', 'object', 'embed', 'form', 'textarea', 'select'],
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
		// Pre-process to remove dangerous patterns that might not be caught by DOMPurify
		// This handles cases where HTML entities in text get decoded by {@html}
		let cleaned = dirty;

		// Remove any onclick or other event handlers, even in text form
		cleaned = cleaned.replace(/\bon\w+\s*=\s*["'][^"']*["']/gi, '');
		cleaned = cleaned.replace(/\bon\w+\s*=\s*[^"\s'>\]]+/gi, '');

		// Remove javascript: URLs
		cleaned = cleaned.replace(/javascript\s*:/gi, '');

		// In Node.js/test environment, we need to handle DOMPurify differently
		if (typeof window === 'undefined') {
			// For server-side rendering or testing, create a mock DOM environment
			const createDOMPurify = DOMPurify as typeof DOMPurify &
				((window: Window) => typeof DOMPurify);
			if (typeof createDOMPurify === 'function') {
				// DOMPurify factory function - create instance with JSDOM
				// eslint-disable-next-line @typescript-eslint/no-require-imports
				const { JSDOM } = require('jsdom');
				const window = new JSDOM('').window;
				const purify = createDOMPurify(window as Window);
				return purify.sanitize(cleaned, componentSanitizerConfig);
			}
		}

		return DOMPurify.sanitize(cleaned, componentSanitizerConfig);
	} catch (error) {
		console.error('HTML sanitization failed:', error);
		return '';
	}
}

export function sanitizeMarkdownHtml(html: string): string {
	console.warn('sanitizeMarkdownHtml is deprecated - migrate to component-based rendering');
	return sanitizeHtml(html);
}
