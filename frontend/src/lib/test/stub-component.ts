import PropsStub from './PropsStub.svelte';

/**
 * A component that renders `PropsStub` under `name`, for use in a `vi.mock` factory:
 *
 *   vi.mock('./folder/FolderTree.svelte', async () => ({
 *     default: (await import('#lib/test/stub-component.ts')).namedStub('FolderTree')
 *   }));
 *
 * The stub's live props are then available as `stubProps.FolderTree` (from `stub-registry`).
 */
export function namedStub(name: string) {
	return (anchor: unknown, props: Record<string | symbol, unknown>) => {
		const named = new Proxy(props, {
			get: (target, key) => (key === 'stubName' ? name : Reflect.get(target, key)),
			has: (target, key) => key === 'stubName' || Reflect.has(target, key),
			ownKeys: (target) => [...Reflect.ownKeys(target), 'stubName'],
			getOwnPropertyDescriptor: (target, key) =>
				key === 'stubName'
					? { value: name, enumerable: true, configurable: true, writable: false }
					: Reflect.getOwnPropertyDescriptor(target, key)
		});
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		return (PropsStub as any)(anchor, named);
	};
}
