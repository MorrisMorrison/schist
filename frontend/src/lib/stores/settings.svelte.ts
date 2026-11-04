interface AppSettings {
	/** Open documents in edit mode instead of the reading view. */
	openDocumentsInEditMode: boolean;
	/** Start editing in focus mode (the editor alone, full window). */
	alwaysOpenFullscreen: boolean;
	/** Documents and the editor use the whole content area instead of a reading column. */
	fullWidthDocuments: boolean;
	/** Long page and folder names in the sidebar wrap onto two lines instead of being cut off. */
	wrapSidebarNames: boolean;
	/** Show the Links section (backlinks and outgoing links) below each page. */
	showDocumentLinks: boolean;
	/** The Links section opens as a list instead of the graph. */
	preferLinksList: boolean;
}

interface Settings {
	app: AppSettings;
}

const defaultSettings: Settings = {
	app: {
		openDocumentsInEditMode: false,
		alwaysOpenFullscreen: false,
		fullWidthDocuments: false,
		wrapSidebarNames: false,
		showDocumentLinks: true,
		preferLinksList: false
	}
};

const SETTINGS_STORAGE_KEY = 'schist_settings';

function loadSettings(): Settings {
	try {
		const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
		if (stored) {
			const parsed = JSON.parse(stored);
			// Keep only settings that still exist (older versions stored others).
			const app = { ...defaultSettings.app };
			for (const key of Object.keys(app) as (keyof AppSettings)[]) {
				if (typeof parsed.app?.[key] === 'boolean') app[key] = parsed.app[key];
			}
			return { app };
		}
	} catch (error) {
		console.warn('Failed to load settings from localStorage:', error);
	}

	return defaultSettings;
}

function saveSettings(settings: Settings): void {
	try {
		localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
	} catch (error) {
		console.error('Failed to save settings to localStorage:', error);
	}
}

let settingsState = $state<Settings>(loadSettings());

// Function to save settings when they change
function persistSettings() {
	if (typeof localStorage !== 'undefined') {
		saveSettings(settingsState);
	}
}

export const settings = {
	get app() {
		return settingsState.app;
	}
};

/** Classes for a page or folder name in the sidebar: one line cut off, or two lines when wrapping. */
export function sidebarNameClass(): string {
	return settingsState.app.wrapSidebarNames ? 'line-clamp-2 break-words' : 'truncate';
}

/** The PageContainer width for document pages (view, edit, new, focus mode). */
export function documentPageWidth(): 'reading' | 'full' {
	return settingsState.app.fullWidthDocuments ? 'full' : 'reading';
}

export const settingsActions = {
	updateAppSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
		settingsState = {
			...settingsState,
			app: {
				...settingsState.app,
				[key]: value
			}
		};
		persistSettings();
	}
};

export type { Settings, AppSettings };
