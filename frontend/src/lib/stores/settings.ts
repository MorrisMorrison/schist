import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';

interface AppSettings {
	autoSave: boolean;
	autoSaveInterval: number; // minutes
	showLineNumbers: boolean;
	wordWrap: boolean;
	editorTheme: 'light' | 'dark' | 'auto';
	showPreview: boolean;
	defaultNewDocumentPath: string;
}

interface ExportSettings {
	defaultFormat: 'markdown' | 'html' | 'pdf';
	includeMeta: boolean;
	preserveStructure: boolean;
}

interface Settings {
	app: AppSettings;
	export: ExportSettings;
}

const defaultSettings: Settings = {
	app: {
		autoSave: true,
		autoSaveInterval: 2,
		showLineNumbers: false,
		wordWrap: true,
		editorTheme: 'auto',
		showPreview: true,
		defaultNewDocumentPath: '/'
	},
	export: {
		defaultFormat: 'markdown',
		includeMeta: true,
		preserveStructure: true
	}
};

const SETTINGS_STORAGE_KEY = 'schist_settings';

function loadSettings(): Settings {
	if (!browser) return defaultSettings;

	try {
		const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
		if (stored) {
			const parsed = JSON.parse(stored);
			return {
				app: { ...defaultSettings.app, ...parsed.app },
				export: { ...defaultSettings.export, ...parsed.export }
			};
		}
	} catch (error) {
		console.warn('Failed to load settings from localStorage:', error);
	}

	return defaultSettings;
}

function saveSettings(settings: Settings): void {
	if (!browser) return;

	try {
		localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
	} catch (error) {
		console.error('Failed to save settings to localStorage:', error);
	}
}

export const settings = writable<Settings>(loadSettings());

if (browser) {
	settings.subscribe((value) => {
		saveSettings(value);
	});
}

export const appSettings = derived(settings, ($settings) => $settings.app);
export const exportSettings = derived(settings, ($settings) => $settings.export);

export const settingsActions = {
	updateAppSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
		settings.update((current) => ({
			...current,
			app: {
				...current.app,
				[key]: value
			}
		}));
	},

	updateExportSetting<K extends keyof ExportSettings>(key: K, value: ExportSettings[K]) {
		settings.update((current) => ({
			...current,
			export: {
				...current.export,
				[key]: value
			}
		}));
	},

	updateAppSettings(newSettings: Partial<AppSettings>) {
		settings.update((current) => ({
			...current,
			app: {
				...current.app,
				...newSettings
			}
		}));
	},

	updateExportSettings(newSettings: Partial<ExportSettings>) {
		settings.update((current) => ({
			...current,
			export: {
				...current.export,
				...newSettings
			}
		}));
	},

	resetToDefaults() {
		settings.set(defaultSettings);
	},

	resetAppSettings() {
		settings.update((current) => ({
			...current,
			app: defaultSettings.app
		}));
	},

	resetExportSettings() {
		settings.update((current) => ({
			...current,
			export: defaultSettings.export
		}));
	}
};

export type { Settings, AppSettings, ExportSettings };
