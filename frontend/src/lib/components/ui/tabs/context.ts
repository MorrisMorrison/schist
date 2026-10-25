import { getContext, setContext } from 'svelte';
import type { TabsVariant } from './tabs-list.svelte';

const KEY = Symbol('tabs-variant');

/** Called by a TabsList so its triggers can pick the matching look. */
export function setTabsVariant(variant: () => TabsVariant) {
	setContext(KEY, variant);
}

/** The variant of the TabsList a trigger sits in (`default` outside one). */
export function getTabsVariant(): () => TabsVariant {
	return getContext<(() => TabsVariant) | undefined>(KEY) ?? (() => 'default');
}
