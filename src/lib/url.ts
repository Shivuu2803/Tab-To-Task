/**
 * Schemes a task may point at. Deliberately an allowlist, not a blocklist:
 * anything stored here is later handed to chrome.tabs.create and rendered in
 * the UI, and an imported file is attacker-controlled input. A blocklist would
 * let `javascript:`, `data:`, or `blob:` through on the first scheme we forgot.
 */
const ALLOWED_SCHEMES = ['http:', 'https:', 'file:'];

/**
 * Browser surfaces the extension cannot read. Chrome blocks `activeTab` on its
 * own pages, so `tab.url` comes back empty and the saved entry would reopen to
 * nothing. Detect this and say so rather than saving a broken task.
 */
const BLOCKED_HOSTS = [
  'chromewebstore.google.com',
  'chrome.google.com',
  'microsoftedge.microsoft.com',
];

/**
 * The single gate for every URL in the system — capture, import, and reopen all
 * go through this. If it returns false, the URL never reaches storage, an
 * <img> tag, or chrome.tabs.create.
 */
export function isSavableUrl(raw: unknown): raw is string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) return false;

  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }

  if (!ALLOWED_SCHEMES.includes(u.protocol)) return false;
  // The store's own extension pages can't be scripted and are useless to save.
  if (BLOCKED_HOSTS.includes(u.hostname) && u.pathname.startsWith('/detail')) return false;

  return true;
}

/**
 * Query parameters that identify a campaign or a referrer rather than content.
 * Two links differing only by these are the same page to a human.
 */
const TRACKING_PARAMS = [
  'fbclid',
  'gclid',
  'dclid',
  'msclkid',
  'igshid',
  'mc_cid',
  'mc_eid',
  'ref',
  'ref_src',
  'source',
  'spm',
  'yclid',
  '_hsenc',
  '_hsmi',
];

/**
 * A comparison key for "is this the same page?".
 *
 * Only ever used for duplicate detection — the original URL is what gets
 * stored and reopened, because stripping a parameter that actually mattered
 * would send the user to the wrong page.
 */
export function normalizeUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return raw.trim().toLowerCase();
  }

  for (const key of [...u.searchParams.keys()]) {
    if (key.toLowerCase().startsWith('utm_') || TRACKING_PARAMS.includes(key.toLowerCase())) {
      u.searchParams.delete(key);
    }
  }

  u.hash = '';
  u.hostname = u.hostname.replace(/^www\./, '').toLowerCase();
  u.protocol = u.protocol.toLowerCase();
  // A trailing slash is never meaningful for identity.
  u.pathname = u.pathname.replace(/\/+$/, '') || '/';

  u.searchParams.sort();
  return u.toString();
}

/** `github.com/foo/bar` — for compact display under a task title. */
export function displayUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const path = u.pathname === '/' ? '' : u.pathname.replace(/\/$/, '');
    return `${u.hostname.replace(/^www\./, '')}${path}`;
  } catch {
    return raw;
  }
}

/**
 * Chrome's own favicon cache. Requires the "favicon" permission.
 *
 * Deliberately NOT a third-party favicon service (Google's s2, DuckDuckGo's,
 * etc.) — those receive the hostname of every page the user saves, which would
 * turn a local-only extension into a browsing-history leak.
 */
export function faviconFor(pageUrl: string, size = 32): string {
  const u = new URL(chrome.runtime.getURL('/_favicon/'));
  u.searchParams.set('pageUrl', pageUrl);
  u.searchParams.set('size', String(size));
  return u.toString();
}

/**
 * Favicons are only ever rendered from the extension's own `_favicon` endpoint.
 *
 * Without this check an imported file could set faviconUrl to
 * `https://attacker.example/pixel.gif`; the task list would then fetch it on
 * every render, handing a third party the user's IP and a signal for when they
 * open their task list. React escaping does not help — the <img> request is the
 * leak.
 */
export function isSafeFaviconUrl(raw: unknown): raw is string {
  if (typeof raw !== 'string') return false;
  const prefix = chrome.runtime.getURL('/_favicon/');
  return raw.startsWith(prefix);
}
