import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '#lib/test/component-utils.ts';
import Textarea from './textarea.svelte';

describe('Textarea', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
	});

	it('renders textarea element', () => {
		const { container } = render(Textarea);

		const textarea = container.querySelector('textarea');
		expect(textarea).toBeInTheDocument();
		expect(textarea).toHaveAttribute('data-slot', 'textarea');
	});

	it('applies default styling classes', () => {
		const { container } = render(Textarea);

		const textarea = container.querySelector('textarea');
		expect(textarea).toHaveClass(
			'border-input',
			'rounded-md',
			'min-h-16',
			'w-full',
			'px-3',
			'py-2'
		);
	});

	it('applies focus styling classes', () => {
		const { container } = render(Textarea);

		const textarea = container.querySelector('textarea');
		expect(textarea).toHaveClass(
			'focus-visible:border-ring',
			'focus-visible:ring-ring/50',
			'focus-visible:ring-[3px]'
		);
	});

	it('applies disabled styling classes', () => {
		const { container } = render(Textarea, {
			props: { disabled: true }
		});

		const textarea = container.querySelector('textarea');
		expect(textarea).toHaveClass('disabled:cursor-not-allowed', 'disabled:opacity-50');
		expect(textarea).toHaveAttribute('disabled');
	});

	it('handles initial value', () => {
		const { container } = render(Textarea, {
			props: { value: 'Initial content' }
		});

		const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
		expect(textarea.value).toBe('Initial content');
	});

	it('applies custom className', () => {
		const { container } = render(Textarea, {
			props: { class: 'custom-textarea' }
		});

		const textarea = container.querySelector('textarea');
		expect(textarea).toHaveClass('custom-textarea');
	});

	it('forwards props correctly', () => {
		const { container } = render(Textarea, {
			props: {
				placeholder: 'Enter your text here',
				rows: 5,
				cols: 40,
				'data-testid': 'message-textarea'
			}
		});

		const textarea = container.querySelector('textarea');
		expect(textarea).toHaveAttribute('placeholder', 'Enter your text here');
		expect(textarea).toHaveAttribute('rows', '5');
		expect(textarea).toHaveAttribute('cols', '40');
		expect(textarea).toHaveAttribute('data-testid', 'message-textarea');
	});

	it('applies responsive text sizing', () => {
		const { container } = render(Textarea);

		const textarea = container.querySelector('textarea');
		expect(textarea).toHaveClass('text-base', 'md:text-sm');
	});

	it('has proper shadow and transition classes', () => {
		const { container } = render(Textarea);

		const textarea = container.querySelector('textarea');
		expect(textarea).toHaveClass('shadow-xs', 'transition-[color,box-shadow]');
	});

	it('supports field-sizing-content for auto-resize', () => {
		const { container } = render(Textarea);

		const textarea = container.querySelector('textarea');
		expect(textarea).toHaveClass('field-sizing-content');
	});

	it('has proper aria-invalid styling', () => {
		const { container } = render(Textarea);

		const textarea = container.querySelector('textarea');
		expect(textarea).toHaveClass(
			'aria-invalid:ring-destructive/20',
			'aria-invalid:border-destructive'
		);
	});
});
