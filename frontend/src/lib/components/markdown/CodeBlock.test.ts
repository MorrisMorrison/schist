import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '#lib/test/component-utils.ts';
import CodeBlock from './CodeBlock.svelte';
import type { CodeBlock as CodeBlockType } from '#lib/utils/markdown-blocks.ts';

// Mock the CopyButton component
vi.mock('#lib/components/CopyButton.svelte', () => {
	return {
		default: () => ({
			$$: { fragment: null }
		})
	};
});

describe('CodeBlock', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
	});

	const createMockCodeBlock = (overrides: Partial<CodeBlockType> = {}): CodeBlockType => ({
		type: 'code',
		id: 'test-block-1',
		code: 'console.log("Hello World");',
		language: 'javascript',
		highlighted:
			'<span class="hljs-built_in">console</span>.<span class="hljs-title">log</span>(<span class="hljs-string">"Hello World"</span>);',
		raw: '```javascript\nconsole.log("Hello World");\n```',
		...overrides
	});

	it('renders code block with language and highlighted content', () => {
		const block = createMockCodeBlock();
		const { container } = render(CodeBlock, { props: { block } });

		const langLabel = container.querySelector('.code-lang');
		expect(langLabel).toHaveTextContent('javascript');

		const codeElement = container.querySelector('code');
		expect(codeElement).toHaveClass('language-javascript');
		expect(codeElement).toContainHTML(block.highlighted);
	});

	it('renders code block without language', () => {
		const block = createMockCodeBlock({
			language: undefined,
			highlighted: 'console.log("Hello World");'
		});
		const { container } = render(CodeBlock, { props: { block } });

		const langLabel = container.querySelector('.code-lang');
		expect(langLabel).not.toBeInTheDocument();

		const codeElement = container.querySelector('code');
		expect(codeElement).toHaveClass('language-');
	});

	it('handles different programming languages', () => {
		const block = createMockCodeBlock({
			language: 'python',
			highlighted: '# Python code'
		});
		const { container } = render(CodeBlock, { props: { block } });

		const langLabel = container.querySelector('.code-lang');
		expect(langLabel).toHaveTextContent('python');

		const codeElement = container.querySelector('code');
		expect(codeElement).toHaveClass('language-python');
	});
});
