import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { getSettings } from '../lib/tasks';
import { applyTheme, watchSystemTheme } from '../lib/theme';
import { DEFAULT_SETTINGS, Settings } from '../lib/types';
import { useSettings } from '../hooks/useSettings';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { ToastProvider } from '../components/Toast';
import '../styles/index.css';

/**
 * Keeps <html> in step with the stored theme. Subscribing (rather than reading
 * once at mount) is what lets a change in the options page reach a side panel
 * that is already open, and keeps the OS-theme watcher on the current choice.
 */
function ThemeSync({ initial }: { initial: Settings }) {
  const { theme } = useSettings(initial);
  useEffect(() => {
    applyTheme(theme);
    return watchSystemTheme(() => theme);
  }, [theme]);
  return null;
}

/**
 * Shared bootstrap for all four entry points. Reads the theme before the first
 * paint so no view flashes the wrong palette, and wraps every surface in an
 * error boundary so a thrown render never leaves a blank panel.
 */
export async function mount(node: React.ReactNode, surface: string) {
  const root = document.getElementById('root');
  if (!root) throw new Error('Missing #root');

  // Theme is best-effort: a storage failure here must not stop the app from
  // rendering, or a bad read would look identical to a crash.
  let settings = DEFAULT_SETTINGS;
  try {
    settings = await getSettings();
    applyTheme(settings.theme);
  } catch (error) {
    console.error('[Tab-to-Task] could not load theme settings', error);
  }

  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary surface={surface}>
        <ThemeSync initial={settings} />
        <ToastProvider>{node}</ToastProvider>
      </ErrorBoundary>
    </StrictMode>,
  );
}
