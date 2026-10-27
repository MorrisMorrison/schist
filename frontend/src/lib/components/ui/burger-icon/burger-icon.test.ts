import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, user } from '#lib/test/component-utils.ts';
import BurgerIcon from './burger-icon.svelte';

describe('BurgerIcon', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
	});

	it('renders closed by default', () => {
		const { container } = render(BurgerIcon);

		const button = container.querySelector('button');
		expect(button).toBeInTheDocument();
		expect(button).toHaveAttribute('aria-expanded', 'false');
		expect(button).toHaveAttribute('aria-label', 'Open sidebar');
	});

	it('renders open when isOpen is true', () => {
		const { container } = render(BurgerIcon, {
			props: { isOpen: true }
		});

		const button = container.querySelector('button');
		expect(button).toHaveAttribute('aria-expanded', 'true');
		expect(button).toHaveAttribute('aria-label', 'Close sidebar');
	});

	it('calls onClick when clicked', async () => {
		const onClick = vi.fn();
		const { container } = render(BurgerIcon, {
			props: { onClick }
		});

		const button = container.querySelector('button') as HTMLElement;
		await user.click(button);

		expect(onClick).toHaveBeenCalledTimes(1);
	});

	it('renders all three lines', () => {
		const { container } = render(BurgerIcon);

		const button = container.querySelector('button');
		const lines = button?.querySelectorAll('div');
		expect(lines).toHaveLength(3);
	});
});
