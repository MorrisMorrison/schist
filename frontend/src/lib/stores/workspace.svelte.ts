import { apiClient } from '#lib/api/client.ts';
import type { UserInfo } from '#lib/api/types.ts';

interface WorkspaceState {
	users: UserInfo[];
	userCount: number;
	isSharedWorkspace: boolean;
	loading: boolean;
	error: string | null;
}

const defaultWorkspaceState: WorkspaceState = {
	users: [],
	userCount: 0,
	isSharedWorkspace: false,
	loading: false,
	error: null
};

const workspaceState: WorkspaceState = $state<WorkspaceState>(defaultWorkspaceState);

function createWorkspaceStore() {
	return {
		async loadUsers() {
			workspaceState.loading = true;
			workspaceState.error = null;

			try {
				const response = await apiClient.listUsers();
				const users = response.users || [];
				const userCount = users.length;
				const isSharedWorkspace = userCount > 1;

				workspaceState.users = users;
				workspaceState.userCount = userCount;
				workspaceState.isSharedWorkspace = isSharedWorkspace;
				workspaceState.loading = false;
			} catch (error) {
				console.warn('Failed to load workspace users:', error);
				workspaceState.loading = false;
				workspaceState.error = 'Failed to load workspace information';
			}
		},
		reset() {
			Object.assign(workspaceState, defaultWorkspaceState);
		}
	};
}

export const workspaceStore = {
	get users() {
		return workspaceState.users;
	},
	get userCount() {
		return workspaceState.userCount;
	},
	get isSharedWorkspace() {
		return workspaceState.isSharedWorkspace;
	},
	get loading() {
		return workspaceState.loading;
	},
	get error() {
		return workspaceState.error;
	},

	// Action methods
	...createWorkspaceStore()
};
