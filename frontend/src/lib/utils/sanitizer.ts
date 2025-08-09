import DOMPurify from 'dompurify';

const allowedTags = [
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'p',
	'br',
	'hr',
	'em',
	'strong',
	'i',
	'b',
	'u',
	'mark',
	'del',
	's',
	'ins',
	'sup',
	'sub',
	'small',
	'ul',
	'ol',
	'li',
	'blockquote',
	'pre',
	'code',
	'table',
	'thead',
	'tbody',
	'tr',
	'th',
	'td',
	'a',
	'img',
	'div',
	'span',
	'dl',
	'dt',
	'dd'
];

const allowedAttributes = {
	'*': ['class', 'id', 'data-*', 'title'],
	a: ['href', 'target', 'rel'],
	img: ['src', 'alt', 'width', 'height', 'loading', 'data-lightbox', 'data-original-src'],
	pre: ['class'],
	code: ['class'],
	table: ['class'],
	th: ['scope', 'colspan', 'rowspan'],
	td: ['colspan', 'rowspan']
};

const allowedClasses = [
	// Prose/typography classes
	'prose',
	'prose-slate',
	'dark:prose-invert',
	'max-w-none',

	// Code highlighting classes (hljs-*)
	'hljs-*',

	// Image classes
	'h-auto',
	'rounded-lg',
	'shadow-sm',
	'cursor-pointer',
	'hover:opacity-90',
	'transition-opacity',

	// General layout classes
	'w-full',
	'block',
	'inline',
	'inline-block',

	// Text classes
	'text-*',
	'font-*',

	// Background and border classes
	'bg-*',
	'border-*',

	// Spacing classes
	'p-*',
	'm-*',
	'px-*',
	'py-*',
	'mx-*',
	'my-*',

	// Copy button classes
	'copy-button',
	'copy-icon'
];

const sanitizerConfig = {
	ALLOWED_TAGS: allowedTags,
	ALLOWED_ATTR: Object.values(allowedAttributes).flat(),
	ALLOWED_URI_REGEXP:
		/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|data):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
	ALLOW_DATA_ATTR: true,
	ALLOW_UNKNOWN_PROTOCOLS: false,
	FORBID_TAGS: ['script', 'object', 'embed', 'form', 'input', 'textarea', 'select', 'button'],
	FORBID_ATTR: [
		'onclick',
		'onload',
		'onerror',
		'onmouseover',
		'onfocus',
		'onblur',
		'onchange',
		'onsubmit'
	],
	KEEP_CONTENT: true,
	RETURN_DOM_FRAGMENT: false,
	RETURN_DOM: false,
	SANITIZE_DOM: true,
	WHOLE_DOCUMENT: false
};

function isClassAllowed(className: string): boolean {
	return allowedClasses.some((pattern) => {
		if (pattern.includes('*')) {
			const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
			return regex.test(className);
		}
		return pattern === className;
	});
}

function sanitizeClasses(element: Element): void {
	const classList = element.getAttribute('class');
	if (classList) {
		const cleanClasses = classList
			.split(' ')
			.filter((cls) => cls.trim() && isClassAllowed(cls.trim()))
			.join(' ');

		if (cleanClasses) {
			element.setAttribute('class', cleanClasses);
		} else {
			element.removeAttribute('class');
		}
	}
}

function sanitizeClassesInHtml(html: string): string {
	// Simple regex-based class sanitization for SSR
	return html.replace(/class="([^"]*)"/g, (match, classes) => {
		const cleanClasses = classes
			.split(' ')
			.filter((cls: string) => cls.trim() && isClassAllowed(cls.trim()))
			.join(' ');
		
		return cleanClasses ? `class="${cleanClasses}"` : '';
	});
}

// Initialize DOMPurify hooks safely for SSR
if (typeof window !== 'undefined' && DOMPurify.addHook) {
	DOMPurify.addHook('afterSanitizeAttributes', function (node: Node) {
		if (node.nodeType === 1) {
			sanitizeClasses(node as Element);
		}
	});
}

export function sanitizeHtml(dirty: string): string {
	if (!dirty || typeof dirty !== 'string') {
		return '';
	}

	try {
		const result = DOMPurify.sanitize(dirty, sanitizerConfig);
		
		// If hooks aren't available (SSR), manually sanitize classes
		if (typeof window === 'undefined' || !DOMPurify.addHook) {
			return sanitizeClassesInHtml(result);
		}
		
		return result;
	} catch (error) {
		console.error('HTML sanitization failed:', error);
		return '';
	}
}

export function sanitizeMarkdownHtml(html: string): string {
	const config = {
		...sanitizerConfig,
		ADD_TAGS: ['mjx-container', 'mjx-math'],
		ADD_ATTR: ['xmlns', 'display', 'aria-label']
	};

	try {
		const result = DOMPurify.sanitize(html, config);
		
		// If hooks aren't available (SSR), manually sanitize classes
		if (typeof window === 'undefined' || !DOMPurify.addHook) {
			return sanitizeClassesInHtml(result);
		}
		
		return result;
	} catch (error) {
		console.error('Markdown HTML sanitization failed:', error);
		return '';
	}
}

export function createSafeElement(
	tagName: string,
	attributes: Record<string, string> = {},
	textContent = ''
): string {
	const element = document.createElement(tagName);

	Object.entries(attributes).forEach(([key, value]) => {
		if (key === 'class') {
			const cleanClasses = value
				.split(' ')
				.filter((cls) => cls.trim() && isClassAllowed(cls.trim()))
				.join(' ');
			if (cleanClasses) {
				element.setAttribute(key, cleanClasses);
			}
		} else if (!key.startsWith('on') && allowedAttributes['*']?.includes(key)) {
			element.setAttribute(key, value);
		}
	});

	if (textContent) {
		element.textContent = textContent;
	}

	return element.outerHTML;
}
