<script lang="ts">
	import { settings, settingsActions } from '$lib/stores/settings.svelte';
	import { Label } from '$lib/components/ui/label';
	import ToggleSlider from '$lib/components/ui/toggle-slider/ToggleSlider.svelte';
</script>

<div class="space-y-6" data-testid="editor-settings-section">
	<div class="space-y-4">
		<div class="space-y-3">
			<div class="flex items-center justify-between">
				<div class="space-y-1">
					<Label class="text-sm font-medium">Open documents in edit mode</Label>
					<p class="text-muted-foreground text-xs">
						Documents open ready to edit instead of in the reading view (Ctrl+E switches either way)
					</p>
				</div>
				<ToggleSlider
					checked={settings.app.openDocumentsInEditMode}
					onCheckedChange={(checked) =>
						settingsActions.updateAppSetting('openDocumentsInEditMode', checked)}
					size="sm"
				/>
			</div>
		</div>

		<div class="space-y-3">
			<div class="flex items-center justify-between">
				<div class="space-y-1">
					<Label class="text-sm font-medium">Always edit in focus mode</Label>
					<p class="text-muted-foreground text-xs">
						Editing fills the window with just the document (F11 or Escape leaves focus mode)
					</p>
				</div>
				<ToggleSlider
					checked={settings.app.alwaysOpenFullscreen}
					onCheckedChange={(checked) =>
						settingsActions.updateAppSetting('alwaysOpenFullscreen', checked)}
					size="sm"
				/>
			</div>
		</div>
	</div>
</div>
