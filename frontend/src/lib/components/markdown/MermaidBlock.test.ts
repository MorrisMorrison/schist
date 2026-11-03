import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import type { CodeBlock } from '#lib/utils/markdown-blocks.ts';

vi.mock('#lib/utils/mermaid.ts', () => ({
	renderMermaid: vi.fn(),
	mermaidErrorMessage: (err: unknown) => (err instanceof Error ? err.message : String(err))
}));

import { renderMermaid } from '#lib/utils/mermaid.ts';
import { themeStore } from '#lib/stores/theme.svelte.ts';
import MermaidBlock from './MermaidBlock.svelte';

function block(code: string): CodeBlock {
	return { type: 'code', id: 'b1', code, language: 'mermaid', highlighted: code, raw: code };
}

const SVG = '<svg data-test="diagram"><text>A to B</text></svg>';

describe('MermaidBlock', () => {
	beforeEach(() => {
		themeStore.set('light');
		vi.mocked(renderMermaid).mockResolvedValue({ svg: SVG, diagramType: 'flowchart' });
	});

	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it('draws the diagram and can switch to the code', async () => {
		render(MermaidBlock, { props: { block: block('graph LR\n  A --> B') } });

		const diagram = await screen.findByTestId('mermaid-diagram');
		expect(diagram.querySelector('svg[data-test="diagram"]')).not.toBeNull();
		expect(renderMermaid).toHaveBeenCalledWith('graph LR\n  A --> B', 'light');
		expect(screen.getByRole('radio', { name: /diagram/i })).toHaveAttribute('aria-checked', 'true');

		await userEvent.click(screen.getByRole('radio', { name: /code/i }));
		expect(screen.queryByTestId('mermaid-diagram')).not.toBeInTheDocument();
		expect(screen.getByText(/A --> B/)).toBeInTheDocument();

		await userEvent.click(screen.getByRole('radio', { name: /diagram/i }));
		expect(await screen.findByTestId('mermaid-diagram')).toBeInTheDocument();
	});

	it('shows the code and the error when the diagram is invalid', async () => {
		vi.mocked(renderMermaid).mockRejectedValue(new Error('Parse error on line 2'));
		render(MermaidBlock, { props: { block: block('graph LR\n  A -->') } });

		expect(await screen.findByTestId('mermaid-error')).toHaveTextContent(
			'The diagram has an error: Parse error on line 2'
		);
		expect(screen.getByText(/A -->/)).toBeInTheDocument();
		expect(screen.queryByTestId('mermaid-diagram')).not.toBeInTheDocument();
		expect(screen.queryByRole('radio')).not.toBeInTheDocument();
	});

	it('draws again in the new theme when the theme changes', async () => {
		render(MermaidBlock, { props: { block: block('graph LR\n  A --> B') } });
		await screen.findByTestId('mermaid-diagram');

		themeStore.set('dark');

		await vi.waitFor(() =>
			expect(renderMermaid).toHaveBeenLastCalledWith('graph LR\n  A --> B', 'dark')
		);
	});

	it('shows a placeholder while drawing', async () => {
		vi.mocked(renderMermaid).mockReturnValue(new Promise(() => {}));
		render(MermaidBlock, { props: { block: block('graph LR\n  A --> B') } });

		expect(screen.getByText('Drawing diagram…')).toBeInTheDocument();
	});
});
