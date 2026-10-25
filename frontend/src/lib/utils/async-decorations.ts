import { EditorView, Decoration, ViewPlugin, ViewUpdate } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import { EditorState, StateField, StateEffect } from '@codemirror/state';
import type { Range } from '@codemirror/state';

/** How long typing has to pause before decorations are recomputed. */
const UPDATE_DELAY_MS = 750;

/**
 * Decorations computed from the whole document by an async `find` (it may look
 * things up, e.g. which tags or documents exist). They are recomputed after the
 * document stops changing for a moment and mapped through edits in between.
 * `what` names them in the warning logged when `find` fails.
 */
export function asyncDecorations(
	find: (state: EditorState) => Promise<Range<Decoration>[]>,
	what: string
) {
	const setDecorations = StateEffect.define<DecorationSet>();

	const field = StateField.define<DecorationSet>({
		create() {
			return Decoration.none;
		},
		update(decorations, tr) {
			decorations = decorations.map(tr.changes);
			for (const effect of tr.effects) {
				if (effect.is(setDecorations)) {
					decorations = effect.value;
				}
			}
			return decorations;
		},
		provide: (f) => EditorView.decorations.from(f)
	});

	const plugin = ViewPlugin.fromClass(
		class {
			private updateTimer: number | null = null;

			constructor(private view: EditorView) {
				this.scheduleUpdate();
			}

			update(update: ViewUpdate) {
				if (update.docChanged) {
					this.scheduleUpdate();
				}
			}

			destroy() {
				if (this.updateTimer !== null) {
					clearTimeout(this.updateTimer);
				}
			}

			private scheduleUpdate() {
				if (this.updateTimer !== null) {
					clearTimeout(this.updateTimer);
				}

				this.updateTimer = window.setTimeout(async () => {
					try {
						const decorations = await find(this.view.state);

						if (this.view.state.doc) {
							this.view.dispatch({
								effects: setDecorations.of(Decoration.set(decorations))
							});
						}
					} catch (error) {
						console.warn(`Failed to update ${what} decorations:`, error);
					}
				}, UPDATE_DELAY_MS);
			}
		}
	);

	return [field, plugin];
}

/** Styles the autocomplete dropdown (wiki links and hashtags) to match the app. */
export const autocompleteTheme = EditorView.theme({
	'.cm-tooltip': {
		backgroundColor: 'var(--background)',
		border: '1px solid var(--border)',
		borderRadius: 'calc(var(--radius) - 2px)',
		boxShadow: '0 8px 25px rgba(0, 0, 0, 0.15)'
	},
	'.cm-tooltip-autocomplete': {
		backgroundColor: 'var(--background)',
		border: '1px solid var(--border)'
	},
	'.cm-tooltip-autocomplete ul': {
		maxHeight: '200px',
		overflowY: 'auto'
	},
	'.cm-tooltip-autocomplete ul li': {
		padding: '8px 12px',
		cursor: 'pointer',
		color: 'var(--foreground)',
		borderBottom: '1px solid var(--border)'
	},
	'.cm-tooltip-autocomplete ul li:last-child': {
		borderBottom: 'none'
	},
	'.cm-tooltip-autocomplete ul li[aria-selected]': {
		backgroundColor: 'var(--accent)',
		color: 'var(--accent-foreground)'
	},
	'.cm-completionLabel': {
		color: 'var(--foreground)',
		fontWeight: '500'
	},
	'.cm-completionDetail': {
		color: 'var(--muted-foreground)',
		fontSize: '0.875rem',
		fontStyle: 'italic'
	},
	'.cm-completionInfo': {
		color: 'var(--muted-foreground)',
		padding: '8px',
		backgroundColor: 'var(--muted)',
		borderRadius: 'calc(var(--radius) - 4px)',
		fontSize: '0.875rem'
	}
});
