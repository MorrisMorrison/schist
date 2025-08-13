import { writable } from 'svelte/store';
import { apiClient } from '$lib/api/client';
import type { UserInfo } from '$lib/api/types';

interface WorkspaceState {
	users: UserInfo[];
	userCount: number;
	isSharedWorkspace: boolean;
	loading: boolean;
	error: string | null;
}

const initialState: WorkspaceState = {
	users: [],
	userCount: 0,
	isSharedWorkspace: false,
	loading: false,
	error: null
};

function createWorkspaceStore() {
	const { subscribe, set, update } = writable<WorkspaceState>(initialState);

	return {
		subscribe,
		async loadUsers() {
			update((state) => ({ ...state, loading: true, error: null }));

			try {
				const response = await apiClient.listUsers();
				const users = response.users || [];
				const userCount = users.length;
				const isSharedWorkspace = userCount > 1;

				update((state) => ({
					...state,
					users,
					userCount,
					isSharedWorkspace,
					loading: false
				}));
			} catch (error) {
				console.warn('Failed to load workspace users:', error);
				update((state) => ({
					...state,
					loading: false,
					error: 'Failed to load workspace information'
				}));
			}
		},
		reset() {
			set(initialState);
		}
	};
}

export const workspaceStore = createWorkspaceStore();
