---
layout: default
title: Privacy Policy
permalink: /privacy
---

# Privacy Policy for Tab-to-Task

**Last updated:** 1 November 2026

## The short version

Tab-to-Task stores everything on your own device and sends nothing anywhere. There is no account, no
server, and no analytics.

## What the extension stores

When you save a page as a task, the extension records the following in your browser's local
extension storage (`chrome.storage.local`):

- The page URL and title
- The task title and next action you type
- Any notes you add
- Timestamps for when the task was created, updated, completed, or deleted
- Your settings (theme, default sort)

## Where it is stored

On your device only, inside your browser's own extension storage. This data is not synced to any
cloud service by the extension, and is not transmitted to the developer or to any third party.

## What is not collected

- No browsing history. The extension only reads the URL and title of a tab at the moment you
  explicitly invoke it, using Chrome's `activeTab` permission.
- No page content. The extension never reads, scrapes, or stores what is on a page.
- No personal or account information. There are no accounts.
- No analytics, telemetry, crash reporting, or advertising identifiers.

## Network activity

The extension makes no network requests. Favicons are loaded from Chrome's own local favicon cache,
not from any external favicon service.

The only time your browser contacts a website because of this extension is when **you** click a saved
task to reopen its page — which is an ordinary page visit, the same as clicking a bookmark.

## Permissions and why they are needed

| Permission | Purpose |
| --- | --- |
| `storage` | Save your tasks on your device |
| `activeTab` | Read the current tab's URL and title when you invoke the extension |
| `alarms` | Run a daily check that permanently removes tasks left in the trash for over 30 days |
| `contextMenus` | Provide the "Save link as a task" and "Save page as a task" right-click options |
| `favicon` | Show site icons from Chrome's local favicon cache |
| `sidePanel` | Display the task list in Chrome's side panel |

## Your control over your data

- **Export** — Settings → Export tasks writes a JSON file containing everything the extension holds.
- **Delete** — Settings → Delete all tasks permanently removes all stored tasks.
- **Uninstall** — Removing the extension deletes its storage along with it.

Deleted tasks go to a Trash area for 30 days so they can be restored, then are removed permanently.

## Children

The extension is not directed at children and collects no personal information from anyone.

## Changes

If this policy changes, the updated version will be published at this URL and the date above will be
revised.

## Contact

Questions about this policy: open an issue on the project's GitHub repository.
