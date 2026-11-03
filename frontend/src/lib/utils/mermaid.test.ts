import { describe, it, expect } from 'vitest';
import { renderMermaid, mermaidErrorMessage } from './mermaid';

// These use the real Mermaid library in the browser.
describe('renderMermaid', () => {
	it('renders a flowchart to SVG', async () => {
		const { svg, diagramType } = await renderMermaid('graph LR\n  A[Beds] --> B[Compost]', 'light');

		expect(diagramType).toBe('flowchart-v2');
		expect(svg.startsWith('<svg')).toBe(true);
		expect(svg).toContain('Beds');
		expect(svg).not.toMatch(/<script/i);
	});

	it('rejects with a readable message on a syntax error, and keeps working after', async () => {
		const failure = renderMermaid('graph LR\n  A -->', 'light');
		const next = renderMermaid('sequenceDiagram\n  Alice->>Bob: Hi', 'dark');

		await expect(failure).rejects.toThrow();
		const message = mermaidErrorMessage(await failure.catch((e) => e));
		expect(message.length).toBeGreaterThan(0);
		expect(message.split('\n').length).toBeLessThanOrEqual(4);

		const { svg, diagramType } = await next;
		expect(diagramType).toBe('sequence');
		expect(svg).toContain('Alice');
		expect(document.querySelector('[id^="dmermaid-"]')).toBeNull(); // no leftover error graphic
	});

	it('keeps click handlers and scripts out of diagrams', async () => {
		const { svg } = await renderMermaid(
			'graph LR\n  A["<img src=x onerror=alert(1)><script>alert(3)</script>"] --> B\n  click A href "javascript:alert(2)"',
			'light'
		);

		expect(svg).not.toMatch(/onerror|alert\(|<script/i);
	});
});
