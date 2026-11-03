// Renders Mermaid diagrams. The library is large, so it is loaded the first
// time a page actually contains a diagram, not with the app.
import type { Mermaid } from 'mermaid';

export type MermaidTheme = 'light' | 'dark';

export interface MermaidRender {
	svg: string;
	diagramType: string;
}

let loading: Promise<Mermaid> | null = null;
let configuredTheme: MermaidTheme | null = null;
// Mermaid keeps global state while rendering, so renders run one at a time.
let queue: Promise<unknown> = Promise.resolve();
let counter = 0;

function loadMermaid(): Promise<Mermaid> {
	loading ??= import('mermaid').then((module) => module.default);
	return loading;
}

function configure(mermaid: Mermaid, theme: MermaidTheme) {
	if (configuredTheme === theme) return;
	mermaid.initialize({
		startOnLoad: false,
		// No scripts, click handlers or raw HTML from diagram text.
		securityLevel: 'strict',
		// On a syntax error, throw instead of drawing Mermaid's error graphic
		// into the page.
		suppressErrorRendering: true,
		theme: theme === 'dark' ? 'dark' : 'default',
		fontFamily: getComputedStyle(document.body).fontFamily || 'sans-serif'
	});
	configuredTheme = theme;
}

/**
 * Renders a diagram to SVG markup. Rejects with Mermaid's error (a readable
 * message for syntax errors) when the diagram can't be drawn.
 */
export function renderMermaid(code: string, theme: MermaidTheme): Promise<MermaidRender> {
	const run = queue.then(async () => {
		const mermaid = await loadMermaid();
		configure(mermaid, theme);
		const { svg, diagramType } = await mermaid.render(`mermaid-${++counter}`, code);
		return { svg, diagramType };
	});
	// Keep the queue going even when this render fails.
	queue = run.catch(() => undefined);
	return run;
}

/** A short, readable message for a failed render. */
export function mermaidErrorMessage(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	return message.split('\n').slice(0, 4).join('\n').trim() || 'The diagram could not be drawn.';
}
