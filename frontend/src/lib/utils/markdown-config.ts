import hljs from 'highlight.js/lib/core';

import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import java from 'highlight.js/lib/languages/java';
import go from 'highlight.js/lib/languages/go';
import rust from 'highlight.js/lib/languages/rust';
import sql from 'highlight.js/lib/languages/sql';
import json from 'highlight.js/lib/languages/json';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import shell from 'highlight.js/lib/languages/shell';
import markdown from 'highlight.js/lib/languages/markdown';
import yaml from 'highlight.js/lib/languages/yaml';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import nginx from 'highlight.js/lib/languages/nginx';

let initialized = false;

function initializeHighlighting(): void {
	if (initialized) return;

	hljs.registerLanguage('javascript', javascript);
	hljs.registerLanguage('js', javascript);
	hljs.registerLanguage('typescript', typescript);
	hljs.registerLanguage('ts', typescript);
	hljs.registerLanguage('python', python);
	hljs.registerLanguage('py', python);
	hljs.registerLanguage('java', java);
	hljs.registerLanguage('go', go);
	hljs.registerLanguage('golang', go);
	hljs.registerLanguage('rust', rust);
	hljs.registerLanguage('rs', rust);
	hljs.registerLanguage('sql', sql);
	hljs.registerLanguage('json', json);
	hljs.registerLanguage('xml', xml);
	hljs.registerLanguage('html', xml);
	hljs.registerLanguage('css', css);
	hljs.registerLanguage('shell', shell);
	hljs.registerLanguage('bash', shell);
	hljs.registerLanguage('sh', shell);
	hljs.registerLanguage('markdown', markdown);
	hljs.registerLanguage('md', markdown);
	hljs.registerLanguage('yaml', yaml);
	hljs.registerLanguage('yml', yaml);
	hljs.registerLanguage('dockerfile', dockerfile);
	hljs.registerLanguage('nginx', nginx);

	initialized = true;
}

export function highlightCode(code: string, language?: string): string {
	initializeHighlighting();

	if (language && hljs.getLanguage(language)) {
		try {
			return hljs.highlight(code, { language }).value;
		} catch (error) {
			console.warn(`Failed to highlight code for language "${language}":`, error);
		}
	}

	return code
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}
