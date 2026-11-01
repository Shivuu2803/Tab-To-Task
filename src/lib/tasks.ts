import { newId } from './id';
import { getStorageArea, KEYS, isTaskKey, taskKey } from './storage';
import { faviconFor, isSavableUrl, normalizeUrl } from './url';
import { DEFAULT_SETTINGS, Settings, Task, statusOf } from './types';

export const TRASH_RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface NewTaskInput {
  title: string;
  url: string;
  pageTitle: string;
  faviconUrl?: string | null;
  nextAction?: string;
  notes?: string;
}

export class ValidationError extends Error {}

function clean(value: string | undefined, max: number): string {
  return (value ?? '').trim().slice(0, max);
}

/** Shape-check a stored record before trusting it. Storage can hold anything. */
function isTask(value: unknown): value is Task {
  if (!value || typeof value !== 'object') return false;
  const t = value as Partial<Task>;
  return typeof t.id === 'string' && typeof t.url === 'string' && typeof t.title === 'string';
}

export async function listTasks(options: { includeDeleted?: boolean } = {}): Promise<Task[]> {
  const all = await getStorageArea().get(null);
  const tasks: Task[] = [];
  for (const [key, value] of Object.entries(all)) {
    if (!isTaskKey(key) || !isTask(value)) continue;
    if (!options.includeDeleted && value.deletedAt !== null) continue;
    tasks.push(value);
  }
  return tasks;
}

export async function getTask(id: string): Promise<Task | null> {
  const result = await getStorageArea().get(taskKey(id));
  const value = result[taskKey(id)];
  return isTask(value) ? value : null;
}

export async function createTask(input: NewTaskInput): Promise<Task> {
  const url = clean(input.url, 2048);
  if (!url) throw new ValidationError('A task needs a page to point at.');

  const pageTitle = clean(input.pageTitle, 300);
  const title = clean(input.title, 300) || pageTitle || url;
  const now = Date.now();

  const task: Task = {
    id: newId(),
    title,
    url,
    pageTitle,
    faviconUrl: input.faviconUrl ?? null,
    nextAction: clean(input.nextAction, 500),
    notes: clean(input.notes, 5000),
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    deletedAt: null,
  };

  // Single-key write: concurrent saves from the popup and side panel touch
  // different keys and cannot overwrite each other.
  await getStorageArea().set({ [taskKey(task.id)]: task });
  return task;
}

export type TaskPatch = Partial<Pick<Task, 'title' | 'nextAction' | 'notes' | 'url'>>;

export async function updateTask(id: string, patch: TaskPatch): Promise<Task> {
  const existing = await getTask(id);
  if (!existing) throw new ValidationError('That task no longer exists.');

  // Same gate as capture and import: nothing reaches storage that openTaskUrl
  // would later refuse. A blank url keeps the existing one, as before.
  const url = patch.url !== undefined ? clean(patch.url, 2048) : '';
  if (url && !isSavableUrl(url)) {
    throw new ValidationError('That address cannot be opened as a task.');
  }

  const next: Task = {
    ...existing,
    ...(patch.title !== undefined && { title: clean(patch.title, 300) || existing.title }),
    ...(patch.nextAction !== undefined && { nextAction: clean(patch.nextAction, 500) }),
    ...(patch.notes !== undefined && { notes: clean(patch.notes, 5000) }),
    ...(url && { url }),
    updatedAt: Date.now(),
  };

  await getStorageArea().set({ [taskKey(id)]: next });
  return next;
}

export async function setCompleted(id: string, completed: boolean): Promise<Task> {
  const existing = await getTask(id);
  if (!existing) throw new ValidationError('That task no longer exists.');

  const next: Task = {
    ...existing,
    completedAt: completed ? Date.now() : null,
    updatedAt: Date.now(),
  };
  await getStorageArea().set({ [taskKey(id)]: next });
  return next;
}

/**
 * Soft delete. Local-only data with no undo is how an extension earns one-star
 * reviews — the task goes to trash and is purged after TRASH_RETENTION_DAYS.
 */
export async function deleteTask(id: string): Promise<void> {
  const existing = await getTask(id);
  if (!existing) return;
  await getStorageArea().set({
    [taskKey(id)]: { ...existing, deletedAt: Date.now(), updatedAt: Date.now() },
  });
}

export async function restoreTask(id: string): Promise<void> {
  const existing = await getTask(id);
  if (!existing) return;
  await getStorageArea().set({
    [taskKey(id)]: { ...existing, deletedAt: null, updatedAt: Date.now() },
  });
}

/** Drops trashed tasks past the retention window. Safe to call on every startup. */
export async function purgeExpiredTrash(now = Date.now()): Promise<number> {
  const all = await listTasks({ includeDeleted: true });
  const cutoff = now - TRASH_RETENTION_DAYS * DAY_MS;
  const expired = all.filter((t) => t.deletedAt !== null && t.deletedAt < cutoff);
  if (expired.length === 0) return 0;
  await getStorageArea().remove(expired.map((t) => taskKey(t.id)));
  return expired.length;
}

export interface TaskQuery {
  search?: string;
  status?: 'pending' | 'done' | 'all';
  sort?: 'newest' | 'oldest';
}

/** Pure — no storage access, so it is trivial to test and reuse in any view. */
export function queryTasks(tasks: Task[], query: TaskQuery = {}): Task[] {
  const { search = '', status = 'all', sort = 'newest' } = query;
  const needle = search.trim().toLowerCase();

  const filtered = tasks.filter((task) => {
    if (status !== 'all' && statusOf(task) !== status) return false;
    if (!needle) return true;
    return (
      task.title.toLowerCase().includes(needle) ||
      task.nextAction.toLowerCase().includes(needle) ||
      task.pageTitle.toLowerCase().includes(needle) ||
      task.notes.toLowerCase().includes(needle) ||
      task.url.toLowerCase().includes(needle)
    );
  });

  return filtered.sort((a, b) =>
    sort === 'newest' ? b.createdAt - a.createdAt : a.createdAt - b.createdAt,
  );
}

export type TaskView = 'pending' | 'done' | 'trash';

/**
 * One side-panel tab's worth of tasks, from a list that includes the trash.
 *
 * The side panel loads everything once and filters here, rather than reloading
 * with a different `includeDeleted` per tab — that reload left the previous
 * tab's rows on screen for a frame, flashing "Trash is empty" or showing
 * trashed tasks under To do.
 */
export function tasksForView(
  tasks: Task[],
  view: TaskView,
  query: Omit<TaskQuery, 'status'> = {},
): Task[] {
  if (view === 'trash') {
    return queryTasks(
      tasks.filter((t) => t.deletedAt !== null),
      { ...query, status: 'all' },
    );
  }
  return queryTasks(
    tasks.filter((t) => t.deletedAt === null),
    { ...query, status: view },
  );
}

/**
 * Warn on re-saving a page rather than silently creating a duplicate.
 *
 * Compares normalised URLs, so arriving at the same article from a newsletter
 * (?utm_source=…) still matches the copy saved without the tracking tail.
 */
export function findByUrl(tasks: Task[], url: string): Task | undefined {
  const needle = normalizeUrl(url);
  return tasks.find((t) => t.deletedAt === null && normalizeUrl(t.url) === needle);
}

/** Pending = not completed and not trashed. Drives the toolbar badge count. */
export function countPending(tasks: Task[]): number {
  return tasks.filter((t) => t.deletedAt === null && t.completedAt === null).length;
}

const THEMES: Settings['theme'][] = ['system', 'light', 'dark'];
const SORTS: Settings['sort'][] = ['newest', 'oldest'];

/**
 * Settings are read back as a fixed set of known values rather than spread
 * from storage. Anything unrecognised falls back to the default, so a
 * corrupted or hand-edited record cannot put an arbitrary string into a
 * className or a query.
 */
export async function getSettings(): Promise<Settings> {
  const stored = await getStorageArea().get(KEYS.settings);
  const value = stored[KEYS.settings];
  if (!value || typeof value !== 'object') return { ...DEFAULT_SETTINGS };

  const raw = value as Record<string, unknown>;
  const pick = <T,>(candidate: unknown, allowed: T[], fallback: T): T =>
    allowed.includes(candidate as T) ? (candidate as T) : fallback;

  return {
    theme: pick(raw.theme, THEMES, DEFAULT_SETTINGS.theme),
    sort: pick(raw.sort, SORTS, DEFAULT_SETTINGS.sort),
  };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await getStorageArea().set({ [KEYS.settings]: next });
  return next;
}

export interface ExportBundle {
  exportedAt: string;
  schemaVersion: number;
  tasks: Task[];
  settings: Settings;
}

export async function exportAll(): Promise<ExportBundle> {
  const stored = await getStorageArea().get(KEYS.schemaVersion);
  return {
    exportedAt: new Date().toISOString(),
    schemaVersion: Number(stored[KEYS.schemaVersion] ?? 1),
    tasks: await listTasks({ includeDeleted: true }),
    settings: await getSettings(),
  };
}

function finiteNumberOr<T>(value: unknown, fallback: T): number | T {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Rebuilds a task field by field from untrusted input.
 *
 * An import file is attacker-controlled: a user can be talked into importing
 * "their backup" from anywhere. Spreading it (`{ ...task }`) would copy
 * whatever keys it carried straight into storage, so this names every field
 * explicitly. That closes three holes at once:
 *
 *   - a `url` like `javascript:…` reaching chrome.tabs.create
 *   - a `faviconUrl` pointing at an attacker's server, turning the task list
 *     into a tracking beacon on every render
 *   - a `__proto__` key from JSON.parse polluting Object.prototype
 *
 * Returns null for anything that cannot be made safe, so it is skipped.
 */
function sanitizeImportedTask(value: unknown): Task | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;

  // Must point somewhere we are willing to open. No URL, no task.
  if (!isSavableUrl(input.url)) return null;

  const now = Date.now();
  const title = clean(typeof input.title === 'string' ? input.title : '', 300);
  const pageTitle = clean(typeof input.pageTitle === 'string' ? input.pageTitle : '', 300);

  return {
    id: newId(),
    title: title || pageTitle || input.url,
    url: input.url,
    pageTitle,
    // Recomputed from the URL rather than trusted, so it can only ever point
    // at Chrome's local favicon cache.
    faviconUrl: faviconFor(input.url),
    nextAction: clean(typeof input.nextAction === 'string' ? input.nextAction : '', 500),
    notes: clean(typeof input.notes === 'string' ? input.notes : '', 5000),
    createdAt: finiteNumberOr(input.createdAt, now),
    updatedAt: finiteNumberOr(input.updatedAt, now),
    completedAt: finiteNumberOr(input.completedAt, null),
    deletedAt: finiteNumberOr(input.deletedAt, null),
  };
}

/**
 * Additive import — existing tasks are left alone and incoming ones get fresh
 * ids, so importing the same file twice can never overwrite real work.
 */
export async function importBundle(raw: unknown): Promise<number> {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as ExportBundle).tasks)) {
    throw new ValidationError('That file is not a Tab-to-Task export.');
  }

  const writes: Record<string, Task> = {};
  for (const candidate of (raw as ExportBundle).tasks) {
    const task = sanitizeImportedTask(candidate);
    if (task) writes[taskKey(task.id)] = task;
  }

  if (Object.keys(writes).length > 0) await getStorageArea().set(writes);
  return Object.keys(writes).length;
}

export async function deleteEverything(): Promise<void> {
  const all = await getStorageArea().get(null);
  const keys = Object.keys(all).filter(isTaskKey);
  if (keys.length > 0) await getStorageArea().remove(keys);
  await getStorageArea().remove(KEYS.draft);
}
