import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import type { DiffLine, DiffResult } from '$lib/api/types';
import DiffViewer from './DiffViewer.svelte';

function context(n: number, start = 1): DiffLine[] {
	return Array.from({ length: n }, (_, i) => ({
		type: 'context' as const,
		content: `ctx ${start + i}`,
		old_line: start + i,
		new_line: start + i
	}));
}

function diff(lines: DiffLine[], summary = { additions: 0, deletions: 0, modifications: 0 }) {
	const result: DiffResult = {
		path: '/doc',
		hash1: 'abcdef1234567890',
		hash2: '0987654321fedcba',
		lines,
		summary
	};
	return result;
}

describe('DiffViewer', () => {
	afterEach(() => cleanup());

	it('shows the summary counts and short hashes', () => {
		render(DiffViewer, {
			props: { diffResult: diff([], { additions: 3, deletions: 2, modifications: 1 }) }
		});
		expect(screen.getByText('3')).toBeInTheDocument();
		expect(screen.getByText('2')).toBeInTheDocument();
		expect(screen.getByText('1')).toBeInTheDocument();
		expect(screen.getByText('abcdef12')).toBeInTheDocument();
		expect(screen.getByText('09876543')).toBeInTheDocument();
	});

	it('shows a message when there are no differences', () => {
		render(DiffViewer, { props: { diffResult: diff([]) } });
		expect(screen.getByText('No differences found')).toBeInTheDocument();
	});

	it('renders each line type with line numbers and a dash for missing ones', () => {
		const { container } = render(DiffViewer, {
			props: {
				diffResult: diff([
					{ type: 'context', content: 'same', old_line: 1, new_line: 1 },
					{ type: 'deletion', content: 'old text', old_line: 2 },
					{ type: 'addition', content: 'new text', new_line: 2 },
					{ type: 'modification', content: 'changed', old_line: 3, new_line: 3 },
					{ type: 'addition', content: '', new_line: 4 }
				])
			}
		});
		expect(screen.getByText('same')).toBeInTheDocument();
		expect(screen.getByText('old text').className).toContain('text-red-800');
		expect(screen.getByText('new text').className).toContain('text-green-800');
		expect(screen.getByText('changed').className).toContain('text-yellow-800');
		// A deletion has no new line number and an addition no old one.
		expect(screen.getAllByText('—')).toHaveLength(3);
		// Empty content renders a non-breaking space so the row keeps its height.
		const rows = container.querySelectorAll('.font-mono.text-sm > div');
		expect(rows).toHaveLength(5);
		expect(rows[4].lastElementChild!.textContent).toBe(' ');
		// Icons only for changed lines.
		expect(rows[0].querySelector('svg')).toBeNull();
		expect(rows[1].querySelector('svg')).not.toBeNull();
	});

	it('collapses long runs of context between and after changes', () => {
		render(DiffViewer, {
			props: {
				diffResult: diff([
					...context(10, 1),
					{ type: 'addition', content: 'added', new_line: 11 },
					...context(8, 12)
				])
			}
		});
		expect(screen.getByText('⋯ 4 unchanged lines ⋯')).toBeInTheDocument();
		expect(screen.getByText('⋯ 2 unchanged lines ⋯')).toBeInTheDocument();
		expect(screen.getByText('ctx 1')).toBeInTheDocument();
		expect(screen.getByText('ctx 3')).toBeInTheDocument();
		expect(screen.queryByText('ctx 4')).not.toBeInTheDocument();
		expect(screen.getByText('ctx 8')).toBeInTheDocument();
		expect(screen.getByText('ctx 19')).toBeInTheDocument();
		expect(screen.queryByText('ctx 15')).not.toBeInTheDocument();
	});

	it('keeps short context runs intact', () => {
		render(DiffViewer, {
			props: {
				diffResult: diff([
					...context(4, 1),
					{ type: 'deletion', content: 'gone', old_line: 5 },
					...context(3, 6)
				])
			}
		});
		expect(screen.queryByText(/unchanged lines/)).not.toBeInTheDocument();
		for (const n of [1, 2, 3, 4, 6, 7, 8]) {
			expect(screen.getByText(`ctx ${n}`)).toBeInTheDocument();
		}
	});
});
