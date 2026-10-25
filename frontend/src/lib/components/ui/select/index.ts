import { Select as SelectPrimitive } from 'bits-ui';

import Content from './select-content.svelte';
import Item from './select-item.svelte';
import Label from './select-label.svelte';
import ScrollDownButton from './select-scroll-down-button.svelte';
import ScrollUpButton from './select-scroll-up-button.svelte';
import Separator from './select-separator.svelte';
import Trigger, { selectTriggerVariants, type SelectTriggerSize } from './select-trigger.svelte';
import Value from './select-value.svelte';

const Root = SelectPrimitive.Root;
const Group = SelectPrimitive.Group;

export {
	Root,
	Group,
	Trigger,
	Value,
	Content,
	Item,
	Label,
	Separator,
	ScrollUpButton,
	ScrollDownButton,
	selectTriggerVariants,
	type SelectTriggerSize,
	Root as Select,
	Group as SelectGroup,
	Trigger as SelectTrigger,
	Value as SelectValue,
	Content as SelectContent,
	Item as SelectItem,
	Label as SelectLabel,
	Separator as SelectSeparator,
	ScrollUpButton as SelectScrollUpButton,
	ScrollDownButton as SelectScrollDownButton
};
