import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export type Theme = 'light' | 'dark' | 'system';

// Get system theme preference
function getSystemTheme(): 'light' | 'dark' {
  if (!browser) return 'dark'; // Default to dark on server
  
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

// Get stored theme or default to system
function getInitialTheme(): Theme {
  if (!browser) return 'system';
  
  const stored = localStorage.getItem('theme') as Theme;
  if (stored && ['light', 'dark', 'system'].includes(stored)) {
    return stored;
  }
  return 'system';
}

// Resolve theme to actual light/dark value
function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme === 'system') {
    return getSystemTheme();
  }
  return theme;
}

// Create the theme store
export const theme = writable<Theme>(getInitialTheme());

// Create a derived store for the resolved theme
export const resolvedTheme = writable<'light' | 'dark'>('dark');

// Update resolved theme when theme changes
theme.subscribe((currentTheme) => {
  const resolved = resolveTheme(currentTheme);
  resolvedTheme.set(resolved);
  
  if (browser) {
    // Save to localStorage
    localStorage.setItem('theme', currentTheme);
    
    // Update document class
    document.documentElement.classList.toggle('dark', resolved === 'dark');
  }
});

// Listen for system theme changes
if (browser) {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  
  mediaQuery.addEventListener('change', () => {
    theme.update(currentTheme => {
      if (currentTheme === 'system') {
        // Force update by setting the same value
        return 'system';
      }
      return currentTheme;
    });
  });
  
  // Initialize theme on page load
  theme.update(currentTheme => {
    const resolved = resolveTheme(currentTheme);
    document.documentElement.classList.toggle('dark', resolved === 'dark');
    resolvedTheme.set(resolved);
    return currentTheme;
  });
}

// Theme actions
export const themeActions = {
  setTheme: (newTheme: Theme) => {
    theme.set(newTheme);
  },
  
  toggleTheme: () => {
    theme.update(currentTheme => {
      const resolved = resolveTheme(currentTheme);
      return resolved === 'dark' ? 'light' : 'dark';
    });
  },
  
  setSystemTheme: () => {
    theme.set('system');
  }
};