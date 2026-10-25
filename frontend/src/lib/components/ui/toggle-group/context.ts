import { getContext, setContext } from 'svelte';
import type { ToggleGroupSize, ToggleGroupVariant } from './toggle-group.svelte';

export interface ToggleGroupStyle {
	variant: ToggleGroupVariant;
	size: ToggleGroupSize;
}

const KEY = Symbol('toggle-group-style');

/** Called by a ToggleGroup so its items can pick the matching look. */
export function setToggleGroupStyle(style: () => ToggleGroupStyle) {
	setContext(KEY, style);
}

/** The look of the ToggleGroup an item sits in. */
export function getToggleGroupStyle(): () => ToggleGroupStyle {
	return (
		getContext<(() => ToggleGroupStyle) | undefined>(KEY) ??
		(() => ({ variant: 'default', size: 'default' }))
	);
}
