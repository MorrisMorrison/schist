import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { waitForDialogFocus } from '$lib/test/dialog';
import { apiClient } from '$lib/api/client';
import type { ShareToken } from '$lib/api/types';
import ShareDocumentModal from './ShareDocumentModal.svelte';

vi.mock('$lib/api/client', () => ({
	apiClient: { listShares: vi.fn(), createShare: vi.fn(), revokeShare: vi.fn() }
}));

const DAY = 24 * 60 * 60 * 1000;

function share(id: string, overrides: Partial<ShareToken> = {}): ShareToken {
	return {
		id,
		document_path: '/notes/doc',
		token: `tok-${id}`,
		share_url: `https://wiki.test/share/${id}`,
		created_at: new Date().toISOString(),
		expires_at: new Date(Date.now() + 10 * DAY).toISOString(),
		created_by: 'me',
		...overrides
	};
}

describe('ShareDocumentModal', () => {
	const onclose = vi.fn();

	async function renderModal() {
		const result = render(ShareDocumentModal, {
			props: { open: true, documentPath: '/notes/doc', documentTitle: 'Doc', onclose }
		});
		if (screen.queryByRole('dialog')) await waitForDialogFocus();
		return result;
	}

	beforeEach(() => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.mocked(apiClient.listShares).mockResolvedValue({ shares: [] } as never);
	});

	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
		vi.restoreAllMocks();
	});

	it('shows the empty state when the document has no shares', async () => {
		await renderModal();
		expect(screen.getByRole('heading', { name: 'Share "Doc"' })).toBeInTheDocument();
		expect(await screen.findByText('No share links created yet')).toBeInTheDocument();
		expect(apiClient.listShares).toHaveBeenCalledTimes(1);
	});

	it('handles a response without a shares array', async () => {
		vi.mocked(apiClient.listShares).mockResolvedValue({} as never);
		await renderModal();
		expect(await screen.findByText('No share links created yet')).toBeInTheDocument();
	});

	it('lists only shares for this document, with their expiry', async () => {
		vi.mocked(apiClient.listShares).mockResolvedValue({
			shares: [
				share('a'),
				share('soon', { expires_at: new Date(Date.now() + DAY).toISOString() }),
				share('never', { expires_at: '' }),
				share('other', { document_path: '/other' })
			]
		} as never);
		await renderModal();
		const urls = await screen.findAllByTestId('share-url');
		expect(urls.map((u) => (u as HTMLInputElement).value)).toEqual([
			'https://wiki.test/share/a',
			'https://wiki.test/share/soon',
			'https://wiki.test/share/never'
		]);
		expect(screen.getAllByText(/^Expires /)).toHaveLength(2);
		expect(screen.getByText(/^Expires /, { selector: '.text-amber-600' })).toBeInTheDocument();
		expect(screen.getByText('Never expires', { selector: 'span' })).toBeInTheDocument();
	});

	it('shows an error when shares fail to load', async () => {
		vi.mocked(apiClient.listShares).mockRejectedValue(new Error('network down'));
		await renderModal();
		expect(await screen.findByText('Failed to load shares')).toBeInTheDocument();
	});

	it('shows an empty list without an error on 401', async () => {
		vi.mocked(apiClient.listShares).mockRejectedValue(
			new Error(JSON.stringify({ error: 'Unauthorized', code: 'UNAUTHORIZED' }))
		);
		await renderModal();
		expect(await screen.findByText('No share links created yet')).toBeInTheDocument();
		expect(screen.queryByText('Failed to load shares')).not.toBeInTheDocument();
	});

	it('creates a share with the selected expiry', async () => {
		vi.mocked(apiClient.createShare).mockResolvedValue(share('new'));
		await renderModal();
		await screen.findByText('No share links created yet');
		await userEvent.selectOptions(screen.getByLabelText('Expiry'), '30');
		await userEvent.click(screen.getByTestId('create-share-link'));

		expect(apiClient.createShare).toHaveBeenCalledWith({
			document_path: '/notes/doc',
			expiry_days: 30
		});
		expect(await screen.findByText('Share link created successfully!')).toBeInTheDocument();
		expect(screen.getByTestId('share-url')).toHaveValue('https://wiki.test/share/new');
	});

	it('shows an error when creating a share fails', async () => {
		vi.mocked(apiClient.createShare).mockRejectedValue(new Error('nope'));
		await renderModal();
		await screen.findByText('No share links created yet');
		await userEvent.click(screen.getByTestId('create-share-link'));
		expect(await screen.findByText('Failed to create share link')).toBeInTheDocument();
	});

	it('revokes a share', async () => {
		vi.mocked(apiClient.listShares).mockResolvedValue({ shares: [share('a')] } as never);
		vi.mocked(apiClient.revokeShare).mockResolvedValue(undefined as never);
		await renderModal();
		await userEvent.click(await screen.findByTestId('revoke-share-btn'));
		expect(apiClient.revokeShare).toHaveBeenCalledWith('a');
		expect(await screen.findByText('Share link revoked successfully!')).toBeInTheDocument();
		expect(screen.queryByTestId('share-url')).not.toBeInTheDocument();
	});

	it('shows an error when revoking fails', async () => {
		vi.mocked(apiClient.listShares).mockResolvedValue({ shares: [share('a')] } as never);
		vi.mocked(apiClient.revokeShare).mockRejectedValue(new Error('nope'));
		await renderModal();
		await userEvent.click(await screen.findByTestId('revoke-share-btn'));
		expect(await screen.findByText('Failed to revoke share link')).toBeInTheDocument();
		expect(screen.getByTestId('share-url')).toBeInTheDocument();
	});

	it('copies and opens the link', async () => {
		vi.mocked(apiClient.listShares).mockResolvedValue({ shares: [share('a')] } as never);
		const writeText = vi.fn().mockResolvedValue(undefined);
		vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue({ writeText } as never);
		const open = vi.spyOn(window, 'open').mockReturnValue(null);
		await renderModal();
		const url = await screen.findByTestId('share-url');
		const [copyBtn, openBtn] = Array.from(
			url.parentElement!.querySelectorAll('button')
		) as HTMLButtonElement[];

		await userEvent.click(copyBtn);
		expect(writeText).toHaveBeenCalledWith('https://wiki.test/share/a');
		expect(await screen.findByText('Link copied to clipboard!')).toBeInTheDocument();

		await userEvent.click(openBtn);
		expect(open).toHaveBeenCalledWith('https://wiki.test/share/a', '_blank');
	});

	it('reports a clipboard failure', async () => {
		vi.mocked(apiClient.listShares).mockResolvedValue({ shares: [share('a')] } as never);
		vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue({
			writeText: vi.fn().mockRejectedValue(new Error('denied'))
		} as never);
		await renderModal();
		const url = await screen.findByTestId('share-url');
		await userEvent.click(url.parentElement!.querySelector('button')!);
		expect(await screen.findByText('Failed to copy to clipboard')).toBeInTheDocument();
	});

	it('calls onclose on Escape', async () => {
		await renderModal();
		await screen.findByText('No share links created yet');
		await userEvent.keyboard('{Escape}');
		expect(onclose).toHaveBeenCalled();
	});
});
