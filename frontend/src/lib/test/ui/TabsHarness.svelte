<script lang="ts">
	// A ui/tabs set for the library's component tests.
	import * as Tabs from '#lib/components/ui/tabs/index.ts';
	import type { TabsVariant } from '#lib/components/ui/tabs/index.ts';

	interface Props {
		value?: string;
		variant?: TabsVariant;
		activationMode?: 'automatic' | 'manual';
		onValueChange?: (value: string) => void;
	}

	let {
		value = $bindable('account'),
		variant = 'default',
		activationMode = 'automatic',
		onValueChange
	}: Props = $props();
</script>

<Tabs.Root bind:value {activationMode} {onValueChange}>
	<Tabs.List {variant} aria-label="Settings">
		<Tabs.Trigger value="account">Account</Tabs.Trigger>
		<Tabs.Trigger value="billing" disabled>Billing</Tabs.Trigger>
		<Tabs.Trigger value="password">Password</Tabs.Trigger>
	</Tabs.List>
	<Tabs.Content value="account">Account panel</Tabs.Content>
	<Tabs.Content value="billing">Billing panel</Tabs.Content>
	<Tabs.Content value="password">Password panel</Tabs.Content>
</Tabs.Root>
<output data-testid="tabs-value">{value}</output>
