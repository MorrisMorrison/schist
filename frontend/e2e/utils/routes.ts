// Use service names in CI, localhost for local development
const isCI = typeof globalThis.process !== 'undefined' && globalThis.process?.env?.CI;
const authDisabledURL = isCI ? 'http://schist-e2e-auth-disabled:8080' : 'http://localhost:8081';
const authEnabledURL = isCI ? 'http://schist-e2e-auth-enabled:8080' : 'http://localhost:8082';

export const AUTH_DISABLED_BASE_URL = authDisabledURL;
export const AUTH_ENABLED_BASE_URL = authEnabledURL;
export const LOGIN_URL = `${AUTH_ENABLED_BASE_URL}/login`;
export const SETUP_URL = `${AUTH_ENABLED_BASE_URL}/setup`;
export const SETTINGS_URL = `${AUTH_ENABLED_BASE_URL}/settings`;
