import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';

// General application settings
interface AppSettings {
	autoSave: boolean;
	autoSaveInterval: number; // minutes
	showLineNumbers: boolean;
	wordWrap: boolean;
	editorTheme: 'light' | 'dark' | 'auto';
	showPreview: boolean;
	defaultNewDocumentPath: string;
}

// Export settings
interface ExportSettings {
	defaultFormat: 'markdown' | 'html' | 'pdf';
	includeMeta: boolean;
	preserveStructure: boolean;
}

// All settings combined
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

// Load settings from localStorage
function loadSettings(): Settings {
	if (!browser) return defaultSettings;

	try {
		const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
		if (stored) {
			const parsed = JSON.parse(stored);
			// Merge with defaults to ensure all properties exist
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

// Save settings to localStorage
function saveSettings(settings: Settings): void {
	if (!browser) return;

	try {
		localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
	} catch (error) {
		console.error('Failed to save settings to localStorage:', error);
	}
}

// Create the settings store
export const settings = writable<Settings>(loadSettings());

// Subscribe to store changes and save to localStorage
if (browser) {
	settings.subscribe((value) => {
		saveSettings(value);
	});
}

// Derived stores for easier access to specific settings
export const appSettings = derived(settings, ($settings) => $settings.app);
export const exportSettings = derived(settings, ($settings) => $settings.export);

// Settings actions
export const settingsActions = {
	// App settings
	updateAppSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
		settings.update((current) => ({
			...current,
			app: {
				...current.app,
				[key]: value
			}
		}));
	},

	// Export settings
	updateExportSetting<K extends keyof ExportSettings>(key: K, value: ExportSettings[K]) {
		settings.update((current) => ({
			...current,
			export: {
				...current.export,
				[key]: value
			}
		}));
	},

	// Bulk updates
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

	// Reset to defaults
	resetToDefaults() {
		settings.set(defaultSettings);
	},

	// Reset specific section
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

// Export types for use in components
export type { Settings, AppSettings, ExportSettings };
