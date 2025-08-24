// Use environment-specific URLs for containerized CI environments
const authDisabledURL =
	globalThis.process?.env.PLAYWRIGHT_AUTH_DISABLED_URL || 'http://localhost:8081';
const authEnabledURL =
	globalThis.process?.env.PLAYWRIGHT_AUTH_ENABLED_URL || 'http://localhost:8082';

export const AUTH_DISABLED_BASE_URL = authDisabledURL;
export const AUTH_ENABLED_BASE_URL = authEnabledURL;
export const LOGIN_URL = `${AUTH_ENABLED_BASE_URL}/login`;
export const SETUP_URL = `${AUTH_ENABLED_BASE_URL}/setup`;
export const SETTINGS_URL = `${AUTH_ENABLED_BASE_URL}/settings`;
