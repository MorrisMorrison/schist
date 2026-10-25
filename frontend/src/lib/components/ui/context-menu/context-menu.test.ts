import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import ContextMenuHarness from '$lib/test/ui/ContextMenuHarness.svelte';
import { waitForPointerEvents } from '$lib/test/dialog';

const menu = () => screen.getByRole('menu', { name: 'Actions' });

/** Waits until the open menu has taken focus, i.e. it is ready for outside presses. */
async function waitForMenuFocus() {
	await waitFor(() => expect(screen.getByRole('menu')).toHaveFocus());
}

async function expectClosed() {
	await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
	await waitForPointerEvents();
}

describe('ContextMenu', () => {
	afterEach(async () => {
		cleanup();
		await waitForPointerEvents();
	});

	it('opens at the pointer when its trigger area is right-clicked', async () => {
		render(ContextMenuHarness);
		expect(screen.queryByRole('menu')).not.toBeInTheDocument();

		const area = screen.getByTestId('area');
		expect(area).toHaveAttribute('data-slot', 'context-menu-trigger');
		await fireEvent.contextMenu(area, { clientX: 120, clientY: 90 });

		const content = await screen.findByRole('menu', { name: 'Actions' });
		expect(content).toHaveAttribute('data-slot', 'context-menu-content');
		await waitFor(() => {
			const rect = content.getBoundingClientRect();
			expect(Math.round(rect.left)).toBeGreaterThanOrEqual(120);
			expect(Math.round(rect.left)).toBeLessThan(130);
			expect(Math.round(rect.top)).toBe(90);
		});
	});

	it('opens in code at a given position', async () => {
		render(ContextMenuHarness, { props: { position: { x: 200, y: 150 }, open: true } });

		const content = await screen.findByRole('menu', { name: 'Actions' });
		await waitFor(() => {
			const rect = content.getBoundingClientRect();
			expect(Math.round(rect.top)).toBe(150);
			expect(Math.round(rect.left)).toBeGreaterThanOrEqual(200);
		});
	});

	it('stays inside the viewport when opened near its edge', async () => {
		render(ContextMenuHarness, {
			props: { position: { x: window.innerWidth - 5, y: window.innerHeight - 5 }, open: true }
		});

		const content = await screen.findByRole('menu');
		await waitFor(() => {
			const rect = content.getBoundingClientRect();
			expect(rect.right).toBeLessThanOrEqual(window.innerWidth);
			expect(rect.bottom).toBeLessThanOrEqual(window.innerHeight);
		});
	});

	it('runs the chosen item and closes', async () => {
		const onAction = vi.fn();
		const onOpenChange = vi.fn();
		render(ContextMenuHarness, { props: { onAction, onOpenChange } });

		await fireEvent.contextMenu(screen.getByTestId('area'));
		await userEvent.click(within(await screen.findByRole('menu')).getByText('Delete'));

		expect(onAction).toHaveBeenCalledWith('delete');
		expect(onOpenChange).toHaveBeenLastCalledWith(false);
		await expectClosed();
	});

	it('is keyboard operable and skips disabled items', async () => {
		const onAction = vi.fn();
		render(ContextMenuHarness, { props: { position: { x: 10, y: 10 }, open: true, onAction } });
		await waitForMenuFocus();

		await userEvent.keyboard('{ArrowDown}');
		await userEvent.keyboard('{ArrowDown}');
		await userEvent.keyboard('{ArrowDown}');
		await userEvent.keyboard('{Enter}');

		// Open, Rename, (Share is disabled), Delete
		expect(onAction).toHaveBeenCalledWith('delete');
		await expectClosed();
	});

	it('closes on Escape', async () => {
		const onOpenChange = vi.fn();
		render(ContextMenuHarness, { props: { onOpenChange } });

		await fireEvent.contextMenu(screen.getByTestId('area'));
		await waitForMenuFocus();
		await userEvent.keyboard('{Escape}');
		await expectClosed();
		expect(onOpenChange).toHaveBeenLastCalledWith(false);
	});

	it('closes on a press outside', async () => {
		render(ContextMenuHarness);

		await fireEvent.contextMenu(screen.getByTestId('area'));
		await waitForMenuFocus();
		// <body> has pointer events off while the menu is open, so press on the page root.
		// bits-ui arms its outside-press listener a moment after opening, so repeat the press
		// until it lands (a slow CI runner can get the first one in before that).
		await waitFor(async () => {
			await userEvent.pointer({
				keys: '[MouseLeft]',
				target: document.documentElement,
				coords: { clientX: window.innerWidth - 5, clientY: window.innerHeight - 5 }
			});
			await new Promise((resolve) => setTimeout(resolve, 50));
			expect(screen.queryByRole('menu')).not.toBeInTheDocument();
		});
		await expectClosed();
	});

	it('renders labels, inset and destructive items, and separators', async () => {
		render(ContextMenuHarness);

		await fireEvent.contextMenu(screen.getByTestId('area'));
		const content = await screen.findByRole('menu');

		expect(within(content).getByText('File')).toHaveAttribute('data-slot', 'context-menu-label');
		expect(within(content).getByRole('menuitem', { name: 'Rename' })).toHaveAttribute('data-inset');
		expect(within(content).getByRole('menuitem', { name: 'Delete' })).toHaveAttribute(
			'data-variant',
			'destructive'
		);
		expect(within(content).getByRole('menuitem', { name: 'Share' })).toHaveAttribute(
			'data-disabled'
		);
		expect(content.querySelector('[data-slot="context-menu-separator"]')).toBeInTheDocument();
		expect(menu()).toBe(content);
		await userEvent.keyboard('{Escape}');
		await expectClosed();
	});
});
