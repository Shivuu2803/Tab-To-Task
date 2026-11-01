# Chrome Web Store listing — copy/paste reference

Everything below goes into the Developer Dashboard. Character limits are the
store's own and are noted where they bite.

---

## Product details

**Extension name** (45 char limit)

```
Tab-to-Task
```

> Keep it exactly this. The store weights the name heavily in its own search,
> and it must match the `name` field in `manifest.json`. Do not add "for Chrome"
> or any Google trademark — that is a rejection.

**Short description** (132 char limit — this is the one people actually read)

```
Save a webpage with its next action, so you can close the tab and still remember why you opened it. All data stays on device.
```

*123 characters.*

**Category**

```
Workflow & Planning
```

**Language**

```
English (United Kingdom)
```

---

## Detailed description

```
Your browser remembers the page. It forgets why you opened it.

You keep twenty tabs open because closing them means losing the thread — the job you meant to apply for, the issue you meant to debug, the article you meant to actually read. A bookmark saves the URL, but it never saves the intent.

Tab-to-Task saves both. Every saved page carries a "next action": the one concrete thing you were going to do about it. Three weeks later a bookmark is a mystery link. A task still tells you what to do.

HOW IT WORKS

1. Press Ctrl+Shift+S on any page (or click the toolbar icon).
2. The page is captured automatically. Write the next action — "Apply before Friday", "Finish part 3", "Compare against the other two".
3. Close the tab. The reminder lives in Tab-to-Task now, not in your tab bar.
4. Press Ctrl+Shift+E to open your list in Chrome's side panel, beside whatever you are working on.

FEATURES

• Save the current page in two keystrokes
• Right-click any link to save it without opening it
• Side panel that stays open while you work
• One search box across titles, next actions, notes and URLs
• Separate To do, Done and Trash views
• Deleted tasks are recoverable for 30 days
• Export everything to JSON, or delete it all, at any time
• Light and dark themes
• Open-task count on the toolbar icon

PRIVACY

Tab-to-Task has no account, no server and no analytics. It makes no network requests at all.

It does not read the content of any page. It has no content scripts. It uses Chrome's "activeTab" permission, which means it can see a page's address and title only at the moment you explicitly invoke it — never in the background, and never for pages you did not save.

It deliberately does not request the "tabs" permission, which is why you will not see a "read your browsing history" warning when you install it.

Site icons come from Chrome's own local favicon cache, never from a third-party favicon service.

Your tasks live in your browser's local extension storage. Nothing is uploaded, and nothing is shared. You can export or delete all of it from Settings.

OPEN SOURCE

The full source is available for review, including the security notes describing exactly what the extension does and does not protect against.
```

---

## Privacy practices tab

**Single purpose description**

```
Tab-to-Task lets a user save the webpage they are currently viewing as a task with a written next action, and later reopen that page from a list. Every feature serves this one purpose: capturing a page with its intent, and returning to it.
```

> The store rejects listings that read as two products. Keep this to one
> sentence of purpose. Do not describe it as "a task manager and tab organiser
> and reminder tool".

**Permission justifications** — one box each in the dashboard.

| Permission | Justification to paste |
| --- | --- |
| `storage` | Saves the user's tasks (page title, URL, next action, notes) in local extension storage so they persist between sessions. No data leaves the device. |
| `activeTab` | Reads the title and URL of the current tab at the moment the user invokes the extension, so the page can be saved as a task. Access is granted only on explicit invocation and is not retained. |
| `alarms` | Schedules one daily local check that permanently removes tasks the user deleted more than 30 days ago, so the trash is emptied as promised even if the browser is never restarted. No network activity. |
| `contextMenus` | Adds "Save link as a task" and "Save page as a task" items to the right-click menu, so a user can save a link without opening it. |
| `favicon` | Displays the site icon next to each saved task, read from Chrome's local favicon cache. This avoids sending any URL to a third-party favicon service. |
| `sidePanel` | Displays the user's task list in Chrome's side panel so it stays visible while they work in the page beside it. |

**Remote code**

```
No, I am not using remote code
```

> True, and verifiable: everything is bundled at build time, there is no eval
> or new Function, and the extension pages run under a CSP with
> `connect-src 'none'`.

**Data usage — what the extension collects**

Tick **nothing**. Then certify all three statements:

- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL**

```
https://<your-github-username>.github.io/tab-to-task/privacy
```

> Required even though nothing is collected. See `docs/` in the repo — pushing
> it and enabling GitHub Pages serves this URL for free.

---

## Distribution

**Visibility**

```
Unlisted
```

> Installable by anyone with the link, invisible in store search and browse.
> This is what you want for a closed test group. It can be switched to Public
> later without losing installs or reviews.

**Regions**: all

**Pricing**: free

---

## Assets checklist

| Asset | File | Status |
| --- | --- | --- |
| Icon 128×128 | `public/icons/icon128.png` (in the zip) | ready |
| Screenshot 1280×800 ×5 | `store-assets/screenshot-1..5.png` | ready |
| Small promo tile 440×280 | `store-assets/promo-small.png` | ready |
| Marquee promo 1400×560 | — | optional, only needed for featuring |
| Package | `tab-to-task-0.1.0.zip` | ready |

---

## Before you submit

- [ ] Run the manual check: load unpacked, press Ctrl+Shift+S on a real page, confirm the title pre-fills and the saved task reopens
- [ ] `npm run build && npm run zip` so the uploaded package matches the current source
- [ ] Push the repo and enable GitHub Pages, so the privacy policy URL resolves
- [ ] Confirm the version in `manifest.json` is higher than any previously uploaded build
