// Get URLs from environment variables in CI, fallback to localhost for local development
const isCI = typeof process !== 'undefined' && process.env?.CI;
const authDisabledURL = (isCI && process.env?.E2E_AUTH_DISABLED_URL) || 'http://localhost:8081';
const authEnabledURL = (isCI && process.env?.E2E_AUTH_ENABLED_URL) || 'http://localhost:8082';

export const AUTH_DISABLED_BASE_URL = authDisabledURL;
export const AUTH_ENABLED_BASE_URL = authEnabledURL;
export const LOGIN_URL = `${AUTH_ENABLED_BASE_URL}/login`;
export const SETUP_URL = `${AUTH_ENABLED_BASE_URL}/setup`;
export const SETTINGS_URL = `${AUTH_ENABLED_BASE_URL}/settings`;
