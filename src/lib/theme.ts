import { Settings } from './types';

/**
 * Applies the theme preference to <html> as a `dark` class, which is what the
 * CSS `dark:` variant keys off. "system" resolves prefers-color-scheme here;
 * watchSystemTheme re-runs this when the OS flips.
 */
export function applyTheme(theme: Settings['theme']): void {
  const root = document.documentElement;
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = theme === 'dark' || (theme === 'system' && prefersDark);
  root.classList.toggle('dark', dark);
}

/** Keeps "system" live if the OS theme flips while a view is open. */
export function watchSystemTheme(getTheme: () => Settings['theme']): () => void {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = () => applyTheme(getTheme());
  media.addEventListener('change', handler);
  return () => media.removeEventListener('change', handler);
}
