# Security notes

What this extension can and cannot do, and the specific attacks it was designed
against. Written for anyone reviewing the code before installing it.

## Attack surface

The extension has an unusually small surface for its category:

- **No content scripts.** It never injects code into, reads, or modifies any web
  page. The only thing it learns about a page is the URL and title that Chrome
  hands it when you explicitly invoke the extension.
- **No network requests.** Nothing is fetched, posted, or beaconed. There is no
  backend, no analytics, no crash reporting, no font or script CDN.
- **No remote code.** Everything is bundled at build time. No `eval`, no
  `new Function`, no dynamic import of a remote URL.
- **No `host_permissions`.** The extension holds no standing access to any site.
- **No `web_accessible_resources`.** No web page can load or probe any file the
  extension ships.
- **`externally_connectable` is empty**, so no website and no other extension
  can send it messages.

## Permissions, and what is deliberately absent

| Requested | Why it is needed |
| --- | --- |
| `storage` | Save tasks on the device |
| `activeTab` | Read the current tab's URL and title, only at the moment you invoke the extension |
| `alarms` | A daily check that empties trash older than 30 days, even if Chrome is never restarted |
| `contextMenus` | The "Save link as a task" and "Save page as a task" right-click items |
| `favicon` | Site icons from Chrome's **local** favicon cache |
| `sidePanel` | The task list panel |

Deliberately not requested:

- **`tabs`** — would grant standing access to every tab's URL and show "Read
  your browsing history" at install. `activeTab` gives the same data for the one
  tab you actually invoked on, and nothing else.
- **`host_permissions`** — never needed, because the extension does not read
  page content.
- **`notifications`, `downloads`, `history`, `bookmarks`** — not used.

`activeTab` is the meaningful distinction: it is granted *per invocation*. If
you never press the shortcut on a page, the extension never learns that page
exists.

## Content Security Policy

Extension pages run under a policy stricter than the MV3 default:

```
script-src 'self'; object-src 'self'; connect-src 'none';
img-src 'self' data:; style-src 'self' 'unsafe-inline';
base-uri 'none'; form-action 'none'; frame-ancestors 'none'
```

`connect-src 'none'` is the load-bearing one: even if an attacker found a way to
run script inside an extension page, the policy gives it nowhere to send data.

## Specific attacks considered

### Malicious import file

Import is the only path by which attacker-authored data enters the extension —
a user can be talked into importing "their backup" from anywhere. Imported
tasks are therefore **rebuilt field by field** rather than spread
(`sanitizeImportedTask` in [src/lib/tasks.ts](src/lib/tasks.ts)):

- **`javascript:` / `data:` / `blob:` URLs** are rejected. URLs pass an
  allowlist (`http`, `https`, `file`), not a blocklist, so a forgotten scheme
  cannot slip through. The check runs again in `openTaskUrl` immediately before
  the URL becomes a navigation.
- **Tracking pixels via `faviconUrl`.** A hostile file could point this at
  `https://attacker.example/pixel.gif`, and the task list would fetch it on
  every render — handing a third party the user's IP and a signal for when they
  open their tasks. The field is **recomputed** from the URL and ignored on
  import, and `isSafeFaviconUrl` rejects anything outside the extension's own
  `_favicon` endpoint at render time.
- **Unknown keys** are dropped rather than written to storage.
- **`__proto__` from `JSON.parse`** cannot reach `Object.prototype`, because no
  untrusted object is ever spread or deep-merged.
- **Non-numeric timestamps** are coerced to safe values.

Each of these has a regression test in
[tests/tasks.test.ts](tests/tasks.test.ts); reintroducing the unsafe spread
fails four of them.

### Cross-site scripting

All rendering goes through React with no `dangerouslySetInnerHTML`, no
`innerHTML`, and no `document.write` anywhere in the source. Task titles, notes,
and URLs are escaped as text.

### Corrupted or hand-edited storage

Settings are read back through a value allowlist rather than spread, so a
tampered record cannot put an arbitrary string into a class name or a query.

## What this does NOT protect against

Stated plainly, because the threat model matters:

- **`chrome.storage.local` is not encrypted.** Anyone with access to your
  operating-system user account can read your saved tasks off disk, as with any
  extension's storage. Do not store secrets in notes.
- **Anyone with physical access to an unlocked browser** can read the task list,
  which contains URLs you have visited.
- **Exported JSON is plain text** and contains every URL you saved. Treat the
  export file as sensitive.
- **Malicious Chrome extensions with broad permissions** can, in principle,
  read other extensions' data via the browser profile on disk. No extension can
  defend against that from the inside.

## Reporting

Found something? Open an issue, or for anything sensitive, contact the
maintainer privately rather than filing publicly.
