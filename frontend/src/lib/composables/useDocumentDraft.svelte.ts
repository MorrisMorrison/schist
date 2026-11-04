import type { Document } from '#lib/api/types.ts';
import { documentActions } from '#lib/stores/documents.svelte.ts';
import { extractHashtagsFromContent, extractTitleFromContent } from '#lib/utils/content-parser.ts';
import { getErrorMessage, parseError } from '#lib/utils/error.ts';
import { generateSlug } from '#lib/utils/path.ts';

export const AUTO_SAVE_DELAY_MS = 10_000;

export type SaveKind = 'manual' | 'auto';
export type StaleReason = 'changed' | 'deleted' | 'unreadable';

interface DocumentDraftOptions {
	document: Document;
	/** Called after every successful save with the stored document. */
	onSaved?: (document: Document) => void;
	autoSaveDelayMs?: number;
}

/** Route-style path ("guides/intro"): no leading slash, as the edit URLs use it. */
function routePath(path: string): string {
	return path.replace(/^\/+/, '');
}

export function replaceLastPathSegment(path: string, segment: string): string {
	const parts = path.split('/').filter(Boolean);
	if (parts.length === 0) return segment;
	parts[parts.length - 1] = segment;
	return parts.join('/');
}

/**
 * The editable copy of a document: its text, dirty state, auto-save and save.
 * The title comes from the first heading, so changing the heading renames the
 * document; every later save (auto-save included) then targets the new path.
 * While the heading stays the same the path is kept, even when it isn't the
 * heading's slug (an imported note lives at its file name).
 */
export function useDocumentDraft(options: DocumentDraftOptions) {
	const delay = options.autoSaveDelayMs ?? AUTO_SAVE_DELAY_MS;
	let document = options.document;

	let path = $state(routePath(document.metaData.path));
	let content = $state(document.content);
	let savedContent = $state(document.content);
	let isSaving = $state(false);
	let error = $state('');
	/**
	 * Set when a save was refused because the page is no longer the one the
	 * editor opened: changed (`current` is the page as it is now), deleted or
	 * unreadable (no current page).
	 */
	let stale = $state<{ current: Document | null; reason: StaleReason } | null>(null);
	/** The user closed the stale dialog to fix something by hand; the next save reopens it. */
	let staleDismissed = $state(false);
	/** A way out of the stale state (keep, load, discard) is running. */
	let resolving = $state(false);
	let lastSaved = $state<Date | null>(null);
	let timer: ReturnType<typeof setTimeout> | null = null;
	// Saves run one at a time; a save requested meanwhile waits for the running one.
	let running: Promise<boolean> | null = null;

	const title = $derived(extractTitleFromContent(content));
	const isDirty = $derived(content !== savedContent);
	/** Where the next save stores the document. */
	const targetPath = $derived(pathFor(content));

	/** The path for text: the current one, or the new heading's slug once it changed. */
	function pathFor(text: string): string {
		const slug = generateSlug(extractTitleFromContent(text));
		if (slug === generateSlug(extractTitleFromContent(savedContent))) return path;
		return replaceLastPathSegment(path, slug);
	}

	function clearAutoSave() {
		if (timer) clearTimeout(timer);
		timer = null;
	}

	function setContent(next: string) {
		content = next;
		clearAutoSave();
		if (content !== savedContent && !stale) {
			timer = setTimeout(() => {
				timer = null;
				void save('auto');
			}, delay);
		}
	}

	async function doSave(kind: SaveKind): Promise<boolean> {
		if (content === savedContent) return true;
		if (!content.trim()) {
			error = 'Content is required';
			return false;
		}

		const snapshot = content;
		const newPath = pathFor(snapshot);
		const slug = newPath.split('/').pop() ?? newPath;

		isSaving = true;
		error = '';
		try {
			if (newPath !== path && (await documentActions.checkDocumentExists(newPath))) {
				error = `A document already exists at "${newPath}". Please choose a different title.`;
				return false;
			}

			const updated = await documentActions.updateDocumentByPath(
				path,
				{
					...document,
					metaData: {
						...document.metaData,
						slug,
						path: newPath,
						title: extractTitleFromContent(snapshot).trim(),
						tags: extractHashtagsFromContent(snapshot)
					},
					content: snapshot.trim(),
					baseVersion: document.version
				},
				kind
			);

			savedContent = snapshot;
			path = newPath;
			lastSaved = new Date();
			document = { ...document, ...updated, content: snapshot.trim() };
			options.onSaved?.(document);
			return true;
		} catch (err) {
			const parsed = parseError(err);
			if (parsed.code === 'DOCUMENT_CHANGED') {
				const current = parsed.details?.document as Document | null | undefined;
				const reason: StaleReason | null = current
					? 'changed'
					: parsed.details?.deleted
						? 'deleted'
						: parsed.details?.unreadable
							? 'unreadable'
							: null;
				if (reason) {
					clearAutoSave();
					stale = { current: current ?? null, reason };
					staleDismissed = false;
					return false;
				}
			}
			error = getErrorMessage(
				err,
				kind === 'auto' ? 'Failed to auto-save page' : 'Failed to save document'
			);
			return false;
		} finally {
			isSaving = false;
		}
	}

	/** Saves if there is anything to save. Resolves false when it could not. */
	async function save(kind: SaveKind = 'manual'): Promise<boolean> {
		clearAutoSave();
		if (stale) {
			// Still waiting for a decision: ask again instead of sending a doomed request.
			staleDismissed = false;
			return false;
		}
		while (running) await running;
		running = doSave(kind);
		try {
			return await running;
		} finally {
			running = null;
		}
	}

	/** Takes the page as it is now; my text goes to the clipboard first. */
	async function loadCurrent() {
		const current = stale?.current;
		if (!current || resolving) return;
		resolving = true;
		try {
			await doLoadCurrent(current);
		} finally {
			resolving = false;
		}
	}

	async function doLoadCurrent(current: Document) {
		const copyFailed = !(await copyToClipboard(content));
		document = current;
		path = routePath(current.metaData.path);
		content = current.content;
		savedContent = current.content;
		stale = null;
		error = copyFailed
			? "Couldn't copy your text to the clipboard; it was replaced by the newer version."
			: '';
		options.onSaved?.(document);
	}

	async function copyToClipboard(text: string): Promise<boolean> {
		try {
			if (!navigator.clipboard?.writeText) return false;
			await navigator.clipboard.writeText(text);
			return true;
		} catch {
			return false;
		}
	}

	/** The page is gone (or unreadable): my text goes to the clipboard, the editor is left clean. */
	async function discardMine() {
		if (!stale || resolving) return;
		resolving = true;
		try {
			await doDiscardMine();
		} finally {
			resolving = false;
		}
	}

	async function doDiscardMine() {
		if (!(await copyToClipboard(content))) {
			// Never throw the text away unless it is safe somewhere else.
			error =
				"Couldn't copy your text to the clipboard, so nothing was discarded. Copy it yourself first, or keep yours.";
			return;
		}
		clearAutoSave();
		savedContent = content;
		stale = null;
		error = '';
	}

	/** Saves my text over the newer page; the other version stays in history. */
	async function keepMine(): Promise<boolean> {
		if (resolving) return false;
		if (!stale) return true;
		resolving = true;
		try {
			return await doKeepMine();
		} finally {
			resolving = false;
		}
	}

	async function doKeepMine(): Promise<boolean> {
		if (!stale) return true;
		const { current, reason } = stale;
		if (reason !== 'changed') {
			// The old page is gone or unreadable, so there is nothing to move: write
			// straight to where the text belongs (the same path when the title is
			// unchanged), and without a version to base on.
			const target = pathFor(content);
			if (target !== path && (await documentActions.checkDocumentExists(target))) {
				error = `A document already exists at "${target}". Please choose a different title.`;
				return false;
			}
			path = target;
		}
		document = { ...document, version: current?.version };
		stale = null;
		return save('manual');
	}

	/** Forgets unsaved edits without saving (the document is being deleted). */
	function discard() {
		clearAutoSave();
		savedContent = content;
	}

	return {
		get content() {
			return content;
		},
		get title() {
			return title;
		},
		get path() {
			return path;
		},
		get targetPath() {
			return targetPath;
		},
		get isDirty() {
			return isDirty;
		},
		get isSaving() {
			return isSaving;
		},
		get lastSaved() {
			return lastSaved;
		},
		get error() {
			return error;
		},
		set error(message: string) {
			error = message;
		},
		/** The page as it is now, when a save was refused because it changed. */
		get conflict() {
			return stale?.current ?? null;
		},
		/** Why a save was refused as stale, or null while nothing is. */
		get staleReason(): StaleReason | null {
			return stale?.reason ?? null;
		},
		/** Whether the stale dialog should show: stale, and not closed by the user. */
		get staleOpen() {
			return stale !== null && !staleDismissed;
		},
		get resolving() {
			return resolving;
		},
		/** Closes the stale dialog without deciding; the next save asks again. */
		dismissStale() {
			if (stale) staleDismissed = true;
		},
		loadCurrent,
		discardMine,
		keepMine,
		setContent,
		save,
		discard,
		dispose: clearAutoSave
	};
}
