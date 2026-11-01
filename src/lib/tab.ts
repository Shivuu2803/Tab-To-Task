import { faviconFor, isSavableUrl } from './url';

export interface CapturedTab {
  url: string;
  title: string;
  faviconUrl: string | null;
}

export type CaptureResult =
  | { ok: true; tab: CapturedTab }
  | { ok: false; reason: 'no-tab' | 'restricted' };

/**
 * Reads the active tab's url and title.
 *
 * This works on `activeTab` alone — clicking the toolbar icon, triggering a
 * keyboard command, or using a context menu item all grant it for the current
 * tab. No `tabs` permission, so no "Read your browsing history" warning at
 * install time.
 */
export async function captureActiveTab(): Promise<CaptureResult> {
  // `currentWindow` is the window containing the running code. From a popup
  // that is normally the browser window it is anchored to, but with several
  // windows open it can resolve to the wrong one. `lastFocusedWindow` is the
  // window the user was actually just looking at, so fall back to it.
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) {
    [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  }
  if (!tab) return { ok: false, reason: 'no-tab' };

  const url = tab.url ?? tab.pendingUrl ?? '';
  if (!isSavableUrl(url)) return { ok: false, reason: 'restricted' };

  return {
    ok: true,
    tab: {
      url,
      title: tab.title?.trim() || url,
      // tab.favIconUrl is frequently undefined and sometimes a data: URL that
      // outlives nothing. Chrome's own favicon cache is the reliable source.
      faviconUrl: faviconFor(url),
    },
  };
}

/**
 * Reopens a saved page.
 *
 * Deliberately does NOT try to focus an existing tab on that URL: the `url`
 * filter on tabs.query requires the `tabs` permission, which shows "Read your
 * browsing history" at install. Not worth it for de-duplication.
 * tabs.create needs no permission at all.
 */
export async function openTaskUrl(url: string): Promise<boolean> {
  // Re-validate at the point of use, not just at the point of save. Storage is
  // shared state and import is one code path away; this is the last gate before
  // a URL becomes a navigation.
  if (!isSavableUrl(url)) return false;
  await chrome.tabs.create({ url });
  return true;
}
