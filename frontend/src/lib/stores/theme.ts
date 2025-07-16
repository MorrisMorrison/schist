import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export type Theme = 'light' | 'dark';

// Get system theme preference
function getSystemTheme(): 'light' | 'dark' {
  if (!browser) return 'dark'; // Default to dark on server
  
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

// Get stored theme or default to system preference
function getInitialTheme(): Theme {
  if (!browser) return 'dark';
  
  const stored = localStorage.getItem('theme') as Theme;
  if (stored && ['light', 'dark'].includes(stored)) {
    return stored;
  }
  // No stored theme, use system preference
  return getSystemTheme();
}


// Create the theme store
export const theme = writable<Theme>(getInitialTheme());

// Update document class when theme changes
theme.subscribe((currentTheme) => {
  if (browser) {
    // Save to localStorage
    localStorage.setItem('theme', currentTheme);
    
    // Update document class
    document.documentElement.classList.toggle('dark', currentTheme === 'dark');
  }
});

// Initialize theme on page load
if (browser) {
  theme.update(currentTheme => {
    document.documentElement.classList.toggle('dark', currentTheme === 'dark');
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
      return currentTheme === 'dark' ? 'light' : 'dark';
    });
  }
};