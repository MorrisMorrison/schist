<script lang="ts">
	// Stand-in for DocumentInlineEditor (CodeMirror, saving) in DocumentView tests.
	import { inlineEditorStub } from './inline-editor-stub';

	const props: Record<string, unknown> = $props();
	inlineEditorStub.props = props;
	inlineEditorStub.mounts++;

	export function save(kind = 'manual'): Promise<boolean> {
		inlineEditorStub.saves.push(kind);
		return Promise.resolve(inlineEditorStub.saveResult);
	}

	export function focus() {
		inlineEditorStub.focusCalls++;
	}

	export function isDirty() {
		return false;
	}

	export function discardChanges() {
		inlineEditorStub.discards++;
	}
</script>

<div data-testid="inline-editor-stub"></div>
