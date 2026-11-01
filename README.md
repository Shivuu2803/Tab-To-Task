# Tab-to-Task

Save a webpage, remember why it matters, and return to it when you're ready to act.

Your browser remembers URLs. It doesn't remember why you opened them. Tab-to-Task saves a page
together with its **next action**, so the tab doesn't have to stay open as a reminder.

A Chrome extension (Manifest V3). All data stays on your device — no account, no server, no network
calls.

---

## Install from source

```bash
npm install
npm run build
```

Then in Chrome:

1. Go to `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and select the `dist/` folder

Chrome will show a "Disable developer mode extensions" prompt on startup. That's expected for
unpacked extensions and goes away once installed from a store.

## Using it

| Action | How |
| --- | --- |
| Save the current page | `Ctrl+Shift+S`, or click the toolbar icon |
| Open your task list | `Ctrl+Shift+E`, or **All tasks →** in the popup |
| Save a link without opening it | Right-click the link → **Save link as a task** |
| Change shortcuts | `chrome://extensions/shortcuts` |

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Rebuilds `dist/` on change (reload the extension in Chrome to pick it up) |
| `npm run build` | Typechecks, then produces a production `dist/` |
| `npm test` | Runs the task-service test suite |
| `npm run zip` | Packs `dist/` into a store-ready zip |
| `npm run smoke` | Loads the built extension into a real Chrome and tests the core flow |
| `npm run icons` | Regenerates the icon PNGs |

---

## Architecture

```
src/
  lib/          storage, task service, pure helpers — no React, fully testable
  hooks/        useTasks: subscribes to storage.onChanged
  components/   shared UI (task list, form controls)
  pages/        popup · sidepanel · options · onboarding
  background/   MV3 service worker
```

Three decisions are worth knowing before changing anything:

**Tasks are stored one key per task (`task:<id>`), never as a single array.** The popup and the side
panel can both be open and both write at once. With one `tasks` array, a read-modify-write from one
context silently discards the other's changes. Per-item keys make concurrent writes disjoint.

**`chrome.storage` is the source of truth, not React state.** Every view subscribes to
`storage.onChanged` and re-reads. Completing a task in the side panel updates an open popup
immediately, and the two can never disagree about what's saved.

**The service worker holds no in-memory state.** MV3 workers are killed when idle. Every handler
reads and writes storage directly; nothing caches across invocations.

### Storage schema

`schemaVersion` is stamped from day one and `runMigrations()` runs on install and update. Adding
migrations later is easy; retrofitting them onto data already in users' browsers is not.

## Permissions

| Permission | Why |
| --- | --- |
| `storage` | Saving tasks locally |
| `activeTab` | Reading the current tab's URL and title, only when you invoke the extension |
| `alarms` | A daily check that empties trash older than 30 days, even if Chrome is never restarted |
| `contextMenus` | The "Save link as a task" and "Save page as a task" right-click items |
| `favicon` | Chrome's own favicon cache, so saved pages are recognisable |
| `sidePanel` | The task list panel |

Deliberately **not** requested:

- **`tabs`** — would show "Read your browsing history" at install. It's only needed to focus an
  existing tab by URL or to read tabs you haven't invoked the extension on. Not worth the warning.
- **`host_permissions`** — the extension never reads page content, only the URL and title that
  `activeTab` already provides.
- **`notifications`** — deferred with deadline reminders.

Favicons come from Chrome's local cache via the `favicon` permission, never from a third-party
favicon service, which would leak every saved URL off-device.

## Resilience

Every surface is wrapped in an error boundary, so a thrown render shows a recovery message instead
of a blank panel. Every storage mutation is guarded and reports failure as a toast rather than a
silent no-op — a failed write must never look like a successful one.

The toolbar badge shows the open-task count and is repainted from , so it cannot
go stale even if the service worker is killed mid-update.

## Security

The extension has no content scripts, makes no network requests, bundles all code (no remote
loading), requests no host permissions, and exposes no web-accessible resources. Extension pages run
under a CSP with `connect-src 'none'`.

The one path by which untrusted data enters is **import**, so imported tasks are rebuilt field by
field rather than spread — blocking `javascript:` URLs, third-party tracking pixels smuggled in as
favicons, unknown keys, and prototype pollution. See [SECURITY.md](SECURITY.md) for the full threat
model, including what it deliberately does *not* protect against.

## Testing

`npm test` covers the task service against an in-memory `chrome.storage` fake
([tests/fakeStorage.ts](tests/fakeStorage.ts)) — creation, validation, completion round-trips, soft
delete and trash expiry, search, sort, and export/import.

Manual checks worth doing before any release:

- Save a page, restart Chrome, confirm the task is still there
- Open the popup and the side panel together; complete a task in one and watch the other update
- Try to save a `chrome://` page — it should explain why it can't rather than fail silently
- Type into the popup, click the page to dismiss it, reopen — the draft should still be there
- Delete a task, restore it from Trash

## License

MIT
