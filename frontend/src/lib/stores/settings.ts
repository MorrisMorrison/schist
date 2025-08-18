import { browser } from '$app/environment';

interface AppSettings {
	autoSave: boolean;
	autoSaveInterval: number; // minutes
	showLineNumbers: boolean;
	wordWrap: boolean;
	editorTheme: 'light' | 'dark' | 'auto';
	showPreview: boolean;
	defaultNewDocumentPath: string;
	alwaysHidePreview: boolean;
	alwaysOpenFullscreen: boolean;
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
		defaultNewDocumentPath: '/',
		alwaysHidePreview: false,
		alwaysOpenFullscreen: false
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

let settingsState: Settings = loadSettings();

if (browser) {
	settingsState = $state<Settings>(loadSettings());

	$effect(() => {
		saveSettings(settingsState);
	});
}

export const settings = {
	get app() {
		return settingsState.app;
	},
	get export() {
		return settingsState.export;
	},
	get current() {
		return settingsState;
	}
};

export const settingsActions = {
	updateAppSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
		if (browser) {
			settingsState = {
				...settingsState,
				app: {
					...settingsState.app,
					[key]: value
				}
			};
		}
	},

	updateExportSetting<K extends keyof ExportSettings>(key: K, value: ExportSettings[K]) {
		if (browser) {
			settingsState = {
				...settingsState,
				export: {
					...settingsState.export,
					[key]: value
				}
			};
		}
	},

	updateAppSettings(newSettings: Partial<AppSettings>) {
		if (browser) {
			settingsState = {
				...settingsState,
				app: {
					...settingsState.app,
					...newSettings
				}
			};
		}
	},

	updateExportSettings(newSettings: Partial<ExportSettings>) {
		if (browser) {
			settingsState = {
				...settingsState,
				export: {
					...settingsState.export,
					...newSettings
				}
			};
		}
	},

	resetToDefaults() {
		if (browser) {
			settingsState = defaultSettings;
		}
	},

	resetAppSettings() {
		if (browser) {
			settingsState = {
				...settingsState,
				app: defaultSettings.app
			};
		}
	},

	resetExportSettings() {
		if (browser) {
			settingsState = {
				...settingsState,
				export: defaultSettings.export
			};
		}
	}
};

export type { Settings, AppSettings, ExportSettings };
