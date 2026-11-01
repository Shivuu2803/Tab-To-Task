import { useEffect, useState } from 'react';

export interface Shortcuts {
  /** Opens the popup to save the current page. */
  save: string;
  /** Opens the side panel. */
  panel: string;
}

/** Shown when a command has no key bound (a conflict, or the user cleared it). */
export const UNSET_SHORTCUT = 'not set';

/**
 * The shortcuts the user actually has, not the ones the manifest suggests.
 * The suggestions differ on macOS, Chrome drops them on a conflict, and the
 * user can rebind them at chrome://extensions/shortcuts, so hard-coded
 * "Ctrl+Shift+S" text is wrong for a good share of people.
 *
 * Starts from an empty string so nothing wrong is shown before the read lands.
 */
export function useShortcuts(): Shortcuts {
  const [shortcuts, setShortcuts] = useState<Shortcuts>({ save: '', panel: '' });

  useEffect(() => {
    let active = true;
    chrome.commands
      .getAll()
      .then((commands) => {
        if (!active) return;
        const keyFor = (name: string) =>
          commands.find((c) => c.name === name)?.shortcut || UNSET_SHORTCUT;
        setShortcuts({ save: keyFor('_execute_action'), panel: keyFor('open-side-panel') });
      })
      .catch((error) => console.error('[Tab-to-Task] could not read shortcuts', error));
    return () => {
      active = false;
    };
  }, []);

  return shortcuts;
}

/** "press Ctrl+Shift+S" or, with no key bound, a pointer to where to set one. */
export function pressPhrase(shortcut: string, fallback: string): string {
  if (!shortcut) return fallback;
  if (shortcut === UNSET_SHORTCUT) return `${fallback} (set a shortcut at chrome://extensions/shortcuts)`;
  return `press ${shortcut}`;
}
