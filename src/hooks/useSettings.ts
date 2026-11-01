import { useEffect, useState } from 'react';
import { getSettings } from '../lib/tasks';
import { KEYS } from '../lib/storage';
import { DEFAULT_SETTINGS, Settings } from '../lib/types';

/**
 * Settings follow the same rule as tasks: storage is the source of truth, and
 * every view subscribes to changes. Without this, changing the sort order in
 * the options page would not reach an already-open side panel.
 *
 * `initial` lets a caller that already read storage skip a render with the
 * defaults (which, for the theme, would be a visible flash).
 */
export function useSettings(initial: Settings = DEFAULT_SETTINGS): Settings {
  const [settings, setSettings] = useState<Settings>(initial);

  useEffect(() => {
    let active = true;
    void getSettings().then((s) => active && setSettings(s));

    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local' || !(KEYS.settings in changes)) return;
      void getSettings().then((s) => active && setSettings(s));
    };

    chrome.storage.onChanged.addListener(onChanged);
    return () => {
      active = false;
      chrome.storage.onChanged.removeListener(onChanged);
    };
  }, []);

  return settings;
}
