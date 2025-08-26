// Single E2E test URL for auth-enabled server
const baseURL = globalThis.process?.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';

export const BASE_URL = baseURL;
export const LOGIN_URL = `${baseURL}/login`;
export const SETUP_URL = `${baseURL}/setup`;
export const SETTINGS_URL = `${baseURL}/settings`;
