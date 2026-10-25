import { ContextMenu as ContextMenuPrimitive } from 'bits-ui';

import Content from './context-menu-content.svelte';
import Item from './context-menu-item.svelte';
import Label from './context-menu-label.svelte';
import Separator from './context-menu-separator.svelte';
import Trigger from './context-menu-trigger.svelte';

const Root = ContextMenuPrimitive.Root;
const Group = ContextMenuPrimitive.Group;
const Portal = ContextMenuPrimitive.Portal;

export {
	Root,
	Group,
	Portal,
	Trigger,
	Content,
	Item,
	Label,
	Separator,
	Root as ContextMenu,
	Group as ContextMenuGroup,
	Portal as ContextMenuPortal,
	Trigger as ContextMenuTrigger,
	Content as ContextMenuContent,
	Item as ContextMenuItem,
	Label as ContextMenuLabel,
	Separator as ContextMenuSeparator
};
