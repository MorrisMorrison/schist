import type { Document } from '#lib/api/types.ts';
import { documentActions } from '#lib/stores/documents.svelte.ts';
import { extractHashtagsFromContent, extractTitleFromContent } from '#lib/utils/content-parser.ts';
import { getErrorMessage, parseError } from '#lib/utils/error.ts';
import { generateSlug } from '#lib/utils/path.ts';

export const AUTO_SAVE_DELAY_MS = 10_000;

export type SaveKind = 'manual' | 'auto';

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
	/** The page as it is now, when a save was refused because it changed. */
	let conflict = $state<Document | null>(null);
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
		if (content !== savedContent && !conflict) {
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
			const current = parsed.details?.document as Document | undefined;
			if (parsed.code === 'DOCUMENT_CHANGED' && current) {
				clearAutoSave();
				conflict = current;
				return false;
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
		if (!conflict) return;
		let copyFailed = false;
		try {
			await navigator.clipboard?.writeText(content);
		} catch {
			copyFailed = true;
		}
		document = conflict;
		path = routePath(conflict.metaData.path);
		content = conflict.content;
		savedContent = conflict.content;
		conflict = null;
		error = copyFailed
			? "Couldn't copy your text to the clipboard; it was replaced by the newer version."
			: '';
		options.onSaved?.(document);
	}

	/** Saves my text over the newer page; the other version stays in history. */
	async function keepMine(): Promise<boolean> {
		if (!conflict) return true;
		document = { ...document, version: conflict.version };
		conflict = null;
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
		get conflict() {
			return conflict;
		},
		loadCurrent,
		keepMine,
		setContent,
		save,
		discard,
		dispose: clearAutoSave
	};
}
