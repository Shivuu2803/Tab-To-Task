import { isTaskKey, runMigrations } from '../lib/storage';
import { countPending, createTask, listTasks, purgeExpiredTrash } from '../lib/tasks';
import { displayUrl, faviconFor, isSavableUrl } from '../lib/url';

/**
 * MV3 service worker.
 *
 * It stops whenever it is idle, so it holds NO in-memory state. Every handler
 * reads from and writes to chrome.storage directly; the popup and side panel
 * read the same storage. Nothing here is a cache that anyone depends on.
 */

const MENU_SAVE_LINK = 'tab-to-task-save-link';
const MENU_SAVE_PAGE = 'tab-to-task-save-page';
const PURGE_ALARM = 'tab-to-task-purge-trash';
const BADGE_COLOR = '#4f46e5';
const SAVED_FLASH_MS = 1500;

chrome.runtime.onInstalled.addListener(async (details) => {
  await runMigrations();
  registerContextMenu();
  await schedulePurge();

  if (details.reason === 'install') {
    // Without a first run, nobody discovers the keyboard shortcut or the side
    // panel, and day-one retention falls off a cliff.
    await chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
  }

  await purgeExpiredTrash();
  await refreshBadge();
});

chrome.runtime.onStartup.addListener(async () => {
  await runMigrations();
  await schedulePurge();
  await purgeExpiredTrash();
  await refreshBadge();
});

/**
 * Startup alone is not enough to honour the 30-day trash promise: plenty of
 * people never fully quit Chrome. A daily alarm covers them.
 *
 * Chrome may drop alarms across a browser restart, so this is called on every
 * startup — but only creates the alarm when missing, so a restart does not
 * keep pushing the next run a full day out.
 */
async function schedulePurge() {
  if (await chrome.alarms.get(PURGE_ALARM)) return;
  await chrome.alarms.create(PURGE_ALARM, { periodInMinutes: 24 * 60 });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === PURGE_ALARM) void purgeExpiredTrash();
});

/**
 * Keeps the badge honest no matter which surface changed a task, and doubles
 * as the recovery path for a flash that never got cleared (see flashSaved).
 */
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !Object.keys(changes).some(isTaskKey)) return;
  void refreshBadge();
});

function registerContextMenu() {
  // removeAll first — onInstalled fires again on every update and duplicate
  // ids throw.
  // Two items rather than one with both contexts, so the label says what will
  // actually be saved.
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_SAVE_LINK,
      title: 'Save link as a task',
      contexts: ['link'],
    });
    chrome.contextMenus.create({
      id: MENU_SAVE_PAGE,
      title: 'Save page as a task',
      contexts: ['page'],
    });
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_SAVE_LINK && info.menuItemId !== MENU_SAVE_PAGE) return;

  // Saving a link without opening it is the cheapest win in the product.
  const isLink = info.menuItemId === MENU_SAVE_LINK;
  const url = (isLink ? info.linkUrl : (info.pageUrl ?? tab?.url)) ?? '';
  if (!isSavableUrl(url)) return;

  // Chrome does not expose a link's text to the context menu (only a text
  // selection, if there is one), and reading it would need a content script.
  // The short display form of the URL is the most readable fallback.
  const title = isLink
    ? info.selectionText?.trim() || displayUrl(url)
    : tab?.title?.trim() || displayUrl(url);

  try {
    await createTask({
      title,
      url,
      pageTitle: isLink ? '' : (tab?.title?.trim() ?? ''),
      faviconUrl: faviconFor(url),
    });
    await flashSaved();
  } catch (error) {
    console.error('[Tab-to-Task] context-menu save failed', error);
    await chrome.action.setBadgeText({ text: '!' });
    await chrome.action.setBadgeBackgroundColor({ color: '#dc2626' });
  }
});

// sidePanel.open() needs a user gesture, and awaiting anything first risks
// losing it. The command event already carries the active tab, so the open
// call is made synchronously inside the handler.
chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== 'open-side-panel' || tab?.windowId === undefined) return;
  void chrome.sidePanel.open({ windowId: tab.windowId });
});

/**
 * The count of open tasks on the toolbar icon.
 *
 * This is the only thing that makes the extension visible once the popup is
 * closed — without it there is nothing to bring a user back.
 */
async function refreshBadge() {
  try {
    const pending = countPending(await listTasks());
    await chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR });
    await chrome.action.setBadgeText({ text: pending > 0 ? String(Math.min(pending, 999)) : '' });
  } catch (error) {
    console.error('[Tab-to-Task] could not refresh the badge', error);
  }
}

/**
 * Brief confirmation for a save made with no visible UI (the context menu).
 *
 * The timer is best-effort: MV3 can kill this worker before it fires, which
 * would otherwise leave a tick stuck on the icon forever. The storage listener
 * above repaints the badge on the next task change, so a missed timer corrects
 * itself rather than persisting.
 */
async function flashSaved() {
  await chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR });
  await chrome.action.setBadgeText({ text: '✓' });
  setTimeout(() => void refreshBadge(), SAVED_FLASH_MS);
}
