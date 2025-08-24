// Static localhost URLs for both local and CI environments
const authDisabledURL = 'http://localhost:8081';
const authEnabledURL = 'http://localhost:8082';

export const AUTH_DISABLED_BASE_URL = authDisabledURL;
export const AUTH_ENABLED_BASE_URL = authEnabledURL;
export const LOGIN_URL = `${AUTH_ENABLED_BASE_URL}/login`;
export const SETUP_URL = `${AUTH_ENABLED_BASE_URL}/setup`;
export const SETTINGS_URL = `${AUTH_ENABLED_BASE_URL}/settings`;
