<script lang="ts">
	import { settings, settingsActions, type AppSettings } from '#lib/stores/settings.svelte.ts';
	import { Label } from '#lib/components/ui/label/index.ts';
	import ToggleSlider from '#lib/components/ui/toggle-slider/ToggleSlider.svelte';

	const options: { key: keyof AppSettings; label: string; description: string }[] = [
		{
			key: 'openDocumentsInEditMode',
			label: 'Open documents in edit mode',
			description:
				'Documents open ready to edit instead of in the reading view (Ctrl+E switches either way)'
		},
		{
			key: 'alwaysOpenFullscreen',
			label: 'Always edit in focus mode',
			description:
				'Editing fills the window with just the document (F11 or Escape leaves focus mode)'
		},
		{
			key: 'fullWidthDocuments',
			label: 'Full-width documents',
			description:
				'Documents and the editor use the whole width of the window instead of a reading column'
		}
	];
</script>

<div class="space-y-6" data-testid="editor-settings-section">
	<div class="space-y-4">
		{#each options as option (option.key)}
			<div class="flex items-center justify-between">
				<div class="space-y-1">
					<Label class="text-sm font-medium">{option.label}</Label>
					<p class="text-muted-foreground text-xs">{option.description}</p>
				</div>
				<ToggleSlider
					checked={settings.app[option.key]}
					onCheckedChange={(checked) => settingsActions.updateAppSetting(option.key, checked)}
					size="sm"
				/>
			</div>
		{/each}
	</div>
</div>
