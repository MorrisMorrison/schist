import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import userEvent from '@testing-library/user-event';

export { render, tick };
export { screen, fireEvent, waitFor } from '@testing-library/svelte';

// Pre-configured user event instance
export const user = userEvent.setup();

// Helper for testing component props and events
export function renderComponent<T>(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	component: any,
	props: T = {} as T,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	options: any = {}
) {
	return render(component, { props, ...options });
}

// Helper for waiting for DOM updates after state changes
export async function waitForUpdate() {
	await tick();
	await new Promise((resolve) => setTimeout(resolve, 0));
}

// Mock data for testing
export const mockDocument = {
	id: 'test-doc',
	name: 'Test Document',
	path: '/test-document',
	content: '# Test Content',
	lastModified: new Date().toISOString(),
	size: 100,
	isFolder: false
};

export const mockFolder = {
	id: 'test-folder',
	name: 'Test Folder',
	path: '/test-folder',
	isFolder: true,
	children: []
};
