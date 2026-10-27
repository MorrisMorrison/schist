import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '#lib/test/component-utils.ts';
import Input from './input.svelte';

describe('Input', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
	});

	it('renders text input by default', () => {
		const { container } = render(Input);

		const input = container.querySelector('input');
		expect(input).toBeInTheDocument();
		expect(input).toHaveAttribute('data-slot', 'input');
		expect(input).not.toHaveAttribute('type'); // Default type is undefined, so no type attribute
	});

	it('renders with specified type', () => {
		const { container } = render(Input, {
			props: { type: 'email' }
		});

		const input = container.querySelector('input');
		expect(input).toHaveAttribute('type', 'email');
	});

	it('renders file input correctly', () => {
		const { container } = render(Input, {
			props: { type: 'file' }
		});

		const input = container.querySelector('input');
		expect(input).toHaveAttribute('type', 'file');
		expect(input).toHaveClass('pt-1.5'); // File input has different padding
	});

	it('applies default styling classes', () => {
		const { container } = render(Input);

		const input = container.querySelector('input');
		expect(input).toHaveClass('border-input', 'bg-background', 'rounded-md', 'h-9', 'px-3', 'py-1');
	});

	it('applies custom className', () => {
		const { container } = render(Input, {
			props: { class: 'custom-input' }
		});

		const input = container.querySelector('input');
		expect(input).toHaveClass('custom-input');
	});

	it('handles initial value prop', () => {
		const { container } = render(Input, {
			props: {
				value: 'Initial Value',
				placeholder: 'Enter text'
			}
		});

		const input = container.querySelector('input') as HTMLInputElement;
		expect(input.value).toBe('Initial Value');
	});

	it('forwards props correctly', () => {
		const { container } = render(Input, {
			props: {
				placeholder: 'Enter your name',
				disabled: true,
				'data-testid': 'name-input'
			}
		});

		const input = container.querySelector('input');
		expect(input).toHaveAttribute('placeholder', 'Enter your name');
		expect(input).toHaveAttribute('disabled');
		expect(input).toHaveAttribute('data-testid', 'name-input');
	});

	it('applies focus styling classes', () => {
		const { container } = render(Input);

		const input = container.querySelector('input');
		expect(input).toHaveClass(
			'focus-visible:border-ring',
			'focus-visible:ring-ring/50',
			'focus-visible:ring-[3px]'
		);
	});

	it('applies disabled styling', () => {
		const { container } = render(Input, {
			props: { disabled: true }
		});

		const input = container.querySelector('input');
		expect(input).toHaveClass('disabled:cursor-not-allowed', 'disabled:opacity-50');
	});
});
