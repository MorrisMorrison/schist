/** Observable state of InlineEditorStub, the DocumentInlineEditor stand-in. */
export const inlineEditorStub = {
	mounts: 0,
	saves: [] as string[],
	saveResult: true,
	focusCalls: 0,
	discards: 0,
	props: null as Record<string, unknown> | null,
	reset() {
		this.mounts = 0;
		this.saves = [];
		this.saveResult = true;
		this.focusCalls = 0;
		this.discards = 0;
		this.props = null;
	}
};
