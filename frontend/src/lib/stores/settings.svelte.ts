interface AppSettings {
	alwaysHidePreview: boolean;
	alwaysOpenFullscreen: boolean;
}

interface Settings {
	app: AppSettings;
}

const defaultSettings: Settings = {
	app: {
		alwaysHidePreview: false,
		alwaysOpenFullscreen: false
	}
};

const SETTINGS_STORAGE_KEY = 'schist_settings';

function loadSettings(): Settings {
	try {
		const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
		if (stored) {
			const parsed = JSON.parse(stored);
			return {
				app: { ...defaultSettings.app, ...parsed.app }
			};
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
