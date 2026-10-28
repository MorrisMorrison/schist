import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import type { ApiToken } from '#lib/api/types.ts';

vi.mock('#lib/api/client.ts', () => ({
	apiClient: {
		listApiTokens: vi.fn(),
		createApiToken: vi.fn(),
		revokeApiToken: vi.fn()
	}
}));

import { apiClient } from '#lib/api/client.ts';
import { chooseSelectOption } from '#lib/test/select.ts';
import ApiTokensSection from './ApiTokensSection.svelte';

const laptop: ApiToken = {
	id: 't1',
	name: 'Laptop',
	prefix: 'sch_ab12cd',
	scope: 'read',
	created_at: '2026-10-01T10:00:00Z'
};
const agent: ApiToken = {
	id: 't2',
	name: 'Agent',
	prefix: 'sch_ef34gh',
	scope: 'read-write',
	created_at: '2026-10-02T10:00:00Z',
	last_used_at: '2026-10-27T10:00:00Z',
	expires_at: '2027-01-01T00:00:00Z'
};

function rows() {
	return screen.queryAllByTestId('api-token-row');
}

describe('ApiTokensSection', () => {
	beforeEach(() => {
		vi.mocked(apiClient.listApiTokens).mockResolvedValue([agent, laptop]);
	});

	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
		vi.restoreAllMocks();
	});

	it('lists tokens with their access, prefix and usage', async () => {
		render(ApiTokensSection, { props: { authEnabled: true, mcpEnabled: true } });

		await waitFor(() => expect(rows()).toHaveLength(2));
		const [agentRow, laptopRow] = rows();
		expect(agentRow).toHaveTextContent('Agent');
		expect(agentRow).toHaveTextContent('sch_ef34gh…');
		expect(agentRow).toHaveTextContent('Read and write');
		expect(agentRow).toHaveTextContent('Last used');
		expect(agentRow).toHaveTextContent('Expires');
		expect(laptopRow).toHaveTextContent('Read only');
		expect(laptopRow).toHaveTextContent('Never used');
		expect(laptopRow).toHaveTextContent('No expiry');
	});

	it('creates a token, shows it once and puts it in the setup snippets', async () => {
		vi.mocked(apiClient.listApiTokens).mockResolvedValue([]);
		vi.mocked(apiClient.createApiToken).mockResolvedValue({
			token: 'sch_secretvalue',
			info: { ...agent, id: 't3', name: 'Claude' }
		});
		render(ApiTokensSection, { props: { authEnabled: true, mcpEnabled: true } });
		expect(await screen.findByText('No tokens yet.')).toBeInTheDocument();
		expect(screen.getByTestId('api-token-create')).toBeDisabled();
		expect(screen.getByTestId('mcp-claude-code')).toHaveTextContent('Bearer YOUR_TOKEN');

		await userEvent.type(screen.getByTestId('api-token-name'), '  Claude  ');
		await chooseSelectOption(screen.getByTestId('api-token-scope'), 'Read and write');
		await chooseSelectOption(screen.getByTestId('api-token-expiry'), '1 year');
		await userEvent.click(screen.getByTestId('api-token-create'));

		expect(apiClient.createApiToken).toHaveBeenCalledWith({
			name: 'Claude',
			scope: 'read-write',
			expires_in_days: 365
		});
		const createdAlert = await screen.findByTestId('api-token-created');
		expect(within(createdAlert).getByTestId('api-token-value')).toHaveTextContent(
			'sch_secretvalue'
		);
		expect(createdAlert).toHaveTextContent("You won't be able to see it again");
		expect(screen.getByTestId('mcp-claude-code')).toHaveTextContent('Bearer sch_secretvalue');
		expect(rows()).toHaveLength(1);
		// The form resets to the safe defaults.
		expect(screen.getByTestId('api-token-name')).toHaveValue('');
		expect(screen.getByTestId('api-token-scope')).toHaveTextContent('Read only');
		expect(screen.getByTestId('api-token-expiry')).toHaveTextContent('90 days');

		await userEvent.click(within(createdAlert).getByRole('button', { name: 'Done' }));
		expect(screen.queryByTestId('api-token-created')).not.toBeInTheDocument();
		expect(screen.queryByText('sch_secretvalue')).not.toBeInTheDocument();
	});

	it('revokes a token after confirming', async () => {
		vi.mocked(apiClient.revokeApiToken).mockResolvedValue();
		const confirm = vi
			.spyOn(window, 'confirm')
			.mockReturnValueOnce(false)
			.mockReturnValueOnce(true);
		render(ApiTokensSection, { props: { authEnabled: true, mcpEnabled: true } });
		await waitFor(() => expect(rows()).toHaveLength(2));

		await userEvent.click(screen.getByRole('button', { name: 'Revoke Laptop' }));
		expect(apiClient.revokeApiToken).not.toHaveBeenCalled();

		await userEvent.click(screen.getByRole('button', { name: 'Revoke Laptop' }));
		expect(confirm).toHaveBeenCalledTimes(2);
		expect(apiClient.revokeApiToken).toHaveBeenCalledWith('t1');
		await waitFor(() => expect(rows()).toHaveLength(1));
		expect(rows()[0]).toHaveTextContent('Agent');
	});

	it('shows errors from the API', async () => {
		vi.mocked(apiClient.listApiTokens).mockRejectedValue(new Error('offline'));
		render(ApiTokensSection, { props: { authEnabled: true, mcpEnabled: false } });

		expect(await screen.findByText('offline')).toBeInTheDocument();
	});

	it('explains how to turn MCP on when it is off', async () => {
		render(ApiTokensSection, { props: { authEnabled: true, mcpEnabled: false } });

		expect(screen.getByTestId('mcp-disabled')).toHaveTextContent('SCHIST_MCP_ENABLED=true');
		expect(screen.queryByTestId('mcp-claude-code')).not.toBeInTheDocument();
		await waitFor(() => expect(rows()).toHaveLength(2), { timeout: 2000 });
	});

	it('without auth shows only the connection details, with no token', () => {
		render(ApiTokensSection, { props: { authEnabled: false, mcpEnabled: true } });

		expect(screen.queryByTestId('api-token-form')).not.toBeInTheDocument();
		expect(apiClient.listApiTokens).not.toHaveBeenCalled();
		const command = screen.getByTestId('mcp-claude-code');
		expect(command).toHaveTextContent(
			/claude mcp add --transport http schist http:\/\/.+\/api\/mcp$/
		);
		expect(command).not.toHaveTextContent('Bearer');
	});
});
