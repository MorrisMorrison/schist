import type { Document } from '$lib/api/types';
import { documentActions } from '$lib/stores/documents.svelte';
import { extractHashtagsFromContent, extractTitleFromContent } from '$lib/utils/content-parser';
import { getErrorMessage } from '$lib/utils/error';
import { generateSlug } from '$lib/utils/path';

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
 * The title comes from the first heading, so a save can rename the document;
 * every later save (auto-save included) then targets the new path.
 */
export function useDocumentDraft(options: DocumentDraftOptions) {
	const delay = options.autoSaveDelayMs ?? AUTO_SAVE_DELAY_MS;
	let document = options.document;

	let path = $state(routePath(document.metaData.path));
	let content = $state(document.content);
	let savedContent = $state(document.content);
	let isSaving = $state(false);
	let error = $state('');
	let lastSaved = $state<Date | null>(null);
	let timer: ReturnType<typeof setTimeout> | null = null;
	// Saves run one at a time; a save requested meanwhile waits for the running one.
	let running: Promise<boolean> | null = null;

	const title = $derived(extractTitleFromContent(content));
	const isDirty = $derived(content !== savedContent);
	/** Where the next save stores the document (the first heading's slug). */
	const targetPath = $derived(replaceLastPathSegment(path, generateSlug(title)));

	function clearAutoSave() {
		if (timer) clearTimeout(timer);
		timer = null;
	}

	function setContent(next: string) {
		content = next;
		clearAutoSave();
		if (content !== savedContent) {
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
		const slug = generateSlug(extractTitleFromContent(snapshot));
		const newPath = replaceLastPathSegment(path, slug);

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
					content: snapshot.trim()
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
		setContent,
		save,
		discard,
		dispose: clearAutoSave
	};
}
