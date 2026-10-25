import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { apiClient } from '$lib/api/client';
import { waitForDialogFocus } from '$lib/test/dialog';
import type { DiffResult, DocumentVersion } from '$lib/api/types';
import VersionHistoryModal from './VersionHistoryModal.svelte';

vi.mock('$lib/api/client', () => ({
	apiClient: { compareDocumentVersions: vi.fn() }
}));

const versions: DocumentVersion[] = [
	{
		hash: 'aaaaaaaa1111',
		message: 'Latest edit',
		author: 'alice',
		timestamp: '2024-03-01T10:00:00Z',
		file_path: 'doc.md'
	},
	{
		hash: 'bbbbbbbb2222',
		message: '',
		author: '',
		timestamp: '2024-02-01T10:00:00Z',
		file_path: 'doc.md'
	},
	{
		hash: 'cccccccc3333',
		message: 'Initial',
		author: 'bob',
		timestamp: '2024-01-01T10:00:00Z',
		file_path: 'doc.md'
	}
];

const diffResult: DiffResult = {
	path: '/doc',
	hash1: 'aaaaaaaa1111',
	hash2: 'cccccccc3333',
	lines: [{ type: 'addition', content: 'brand new line', new_line: 1 }],
	summary: { additions: 1, deletions: 0, modifications: 0 }
};

describe('VersionHistoryModal', () => {
	const onClose = vi.fn();

	async function renderModal(props: Record<string, unknown> = {}) {
		const result = render(VersionHistoryModal, {
			props: { open: true, path: '/doc', versions, onClose, ...props }
		});
		await waitForDialogFocus();
		return result;
	}

	function versionCard(hash: string) {
		return screen
			.getByText(hash.substring(0, 8), { selector: '.font-mono' })
			.closest('.rounded-lg')!;
	}

	function selectButton(hash: string) {
		return within(versionCard(hash) as HTMLElement).getByRole('button', {
			name: /^(Select|Selected)$/
		});
	}

	beforeEach(() => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		cleanup();
		document.body.style.pointerEvents = '';
		vi.clearAllMocks();
		vi.restoreAllMocks();
	});

	it('lists versions with author and message when present', async () => {
		await renderModal();
		expect(screen.getByRole('heading', { name: 'Version History' })).toBeInTheDocument();
		expect(screen.getByText('aaaaaaaa', { selector: '.font-mono' })).toBeInTheDocument();
		expect(screen.getByText('alice')).toBeInTheDocument();
		expect(screen.getByText('Latest edit')).toBeInTheDocument();
		expect(within(versionCard('bbbbbbbb2222') as HTMLElement).queryByText('alice')).toBeNull();
		expect(screen.queryByRole('button', { name: /compare/i })).not.toBeInTheDocument();
	});

	it('shows an empty state without versions', async () => {
		await renderModal({ versions: [] });
		expect(screen.getByText('No version history available')).toBeInTheDocument();
	});

	it('selects two versions, compares them and shows the diff', async () => {
		vi.mocked(apiClient.compareDocumentVersions).mockResolvedValue(diffResult);
		await renderModal();

		await userEvent.click(selectButton('aaaaaaaa1111'));
		expect(selectButton('aaaaaaaa1111')).toHaveTextContent('Selected');
		expect(screen.getByText('Selected for comparison:')).toBeInTheDocument();
		// Selecting the same version again does not pick it as the second one.
		await userEvent.click(selectButton('aaaaaaaa1111'));
		expect(screen.queryByRole('button', { name: /compare/i })).not.toBeInTheDocument();

		await userEvent.click(selectButton('cccccccc3333'));
		await userEvent.click(screen.getByRole('button', { name: /compare/i }));

		expect(apiClient.compareDocumentVersions).toHaveBeenCalledWith(
			'/doc',
			'aaaaaaaa1111',
			'cccccccc3333'
		);
		expect(await screen.findByRole('heading', { name: 'Comparing Versions' })).toBeInTheDocument();
		expect(screen.getByText('+1')).toBeInTheDocument();
		expect(screen.getByText('brand new line')).toBeInTheDocument();

		await userEvent.click(screen.getByRole('button', { name: 'Close Diff' }));
		expect(screen.getByRole('heading', { name: 'Version History' })).toBeInTheDocument();
		// The selection survives closing the diff.
		expect(selectButton('cccccccc3333')).toHaveTextContent('Selected');
	});

	it('starts a new selection when a third version is picked, and clears it', async () => {
		await renderModal();
		await userEvent.click(selectButton('aaaaaaaa1111'));
		await userEvent.click(selectButton('bbbbbbbb2222'));
		await userEvent.click(selectButton('cccccccc3333'));
		expect(selectButton('cccccccc3333')).toHaveTextContent('Selected');
		expect(selectButton('aaaaaaaa1111')).toHaveTextContent('Select');
		expect(selectButton('bbbbbbbb2222')).toHaveTextContent('Select');

		await userEvent.click(screen.getByRole('button', { name: 'Clear Selection' }));
		expect(screen.queryByText('Selected for comparison:')).not.toBeInTheDocument();
	});

	it('shows the error when comparing fails', async () => {
		vi.mocked(apiClient.compareDocumentVersions).mockRejectedValue(
			new Error(JSON.stringify({ error: 'Version not found' }))
		);
		await renderModal();
		await userEvent.click(selectButton('aaaaaaaa1111'));
		await userEvent.click(selectButton('bbbbbbbb2222'));
		await userEvent.click(screen.getByRole('button', { name: /compare/i }));
		expect(await screen.findByText('Version not found')).toBeInTheDocument();
		expect(screen.getByRole('heading', { name: 'Version History' })).toBeInTheDocument();
	});

	it('shows a loading state while comparing', async () => {
		let resolve!: (d: DiffResult) => void;
		vi.mocked(apiClient.compareDocumentVersions).mockReturnValue(new Promise((r) => (resolve = r)));
		await renderModal();
		await userEvent.click(selectButton('aaaaaaaa1111'));
		await userEvent.click(selectButton('bbbbbbbb2222'));
		await userEvent.click(screen.getByRole('button', { name: /compare/i }));
		expect(screen.getByRole('button', { name: /loading/i })).toBeDisabled();
		resolve(diffResult);
		expect(await screen.findByRole('heading', { name: 'Comparing Versions' })).toBeInTheDocument();
	});

	it('confirms and restores a version, then closes', async () => {
		const onRestore = vi.fn().mockResolvedValue(undefined);
		await renderModal({ onRestore });
		await userEvent.click(
			within(versionCard('cccccccc3333') as HTMLElement).getByRole('button', { name: /restore/i })
		);
		expect(screen.getByRole('heading', { name: 'Restore Version' })).toBeInTheDocument();
		expect(screen.getByText('bob')).toBeInTheDocument();
		expect(screen.getByText('Initial')).toBeInTheDocument();

		await userEvent.click(screen.getByRole('button', { name: /^restore$/i }));
		expect(onRestore).toHaveBeenCalledWith(versions[2]);
		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
	});

	it('restores with the default no-op handler', async () => {
		await renderModal();
		await userEvent.click(
			within(versionCard('bbbbbbbb2222') as HTMLElement).getByRole('button', { name: /restore/i })
		);
		// No author or message on this version.
		expect(screen.queryByText('alice')).not.toBeInTheDocument();
		await userEvent.click(screen.getByRole('button', { name: /^restore$/i }));
		await waitFor(() => expect(onClose).toHaveBeenCalled());
	});

	it('cancels a restore and goes back to the list', async () => {
		const onRestore = vi.fn();
		await renderModal({ onRestore });
		await userEvent.click(
			within(versionCard('aaaaaaaa1111') as HTMLElement).getByRole('button', { name: /restore/i })
		);
		await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		expect(screen.getByRole('heading', { name: 'Version History' })).toBeInTheDocument();
		expect(onRestore).not.toHaveBeenCalled();
	});

	it('stays on the confirmation and re-enables it when the restore fails', async () => {
		let reject!: (e: Error) => void;
		const onRestore = vi.fn(() => new Promise<void>((_, r) => (reject = r)));
		await renderModal({ onRestore });
		await userEvent.click(
			within(versionCard('aaaaaaaa1111') as HTMLElement).getByRole('button', { name: /restore/i })
		);
		await userEvent.click(screen.getByRole('button', { name: /^restore$/i }));
		expect(screen.getByRole('button', { name: /restoring/i })).toBeDisabled();
		expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
		reject(new Error('conflict'));
		expect(await screen.findByRole('button', { name: /^restore$/i })).toBeEnabled();
		expect(onClose).not.toHaveBeenCalled();
		expect(console.error).toHaveBeenCalledWith('Failed to restore version:', expect.any(Error));
	});

	it('closes from the Close button and Escape', async () => {
		await renderModal();
		await userEvent.click(screen.getAllByRole('button', { name: 'Close' })[0]);
		expect(onClose).toHaveBeenCalledTimes(1);
		await userEvent.keyboard('{Escape}');
		expect(onClose).toHaveBeenCalledTimes(2);
	});
});
