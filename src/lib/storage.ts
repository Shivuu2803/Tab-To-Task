import { SCHEMA_VERSION } from './types';

/**
 * Minimal surface we need from chrome.storage. Declaring it as an interface
 * (rather than calling chrome.* directly everywhere) does two things:
 *   1. tests can inject an in-memory fake, no browser needed
 *   2. a future backend can be swapped in behind the same four methods
 */
export interface StorageArea {
  get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
  clear(): Promise<void>;
}

export const KEYS = {
  schemaVersion: 'schemaVersion',
  settings: 'settings',
  draft: 'draft',
  taskPrefix: 'task:',
} as const;

export const taskKey = (id: string) => `${KEYS.taskPrefix}${id}`;
export const isTaskKey = (key: string) => key.startsWith(KEYS.taskPrefix);

let area: StorageArea = {
  get: (keys) => chrome.storage.local.get(keys ?? null),
  set: (items) => chrome.storage.local.set(items),
  remove: (keys) => chrome.storage.local.remove(keys),
  clear: () => chrome.storage.local.clear(),
};

/** Test seam. Swap the backing store without touching any caller. */
export function setStorageArea(next: StorageArea) {
  area = next;
}

export function getStorageArea(): StorageArea {
  return area;
}

/**
 * Runs on install and on every update. Writing this on day one is cheap;
 * retrofitting migrations onto data already sitting in users' browsers is not.
 */
export async function runMigrations(): Promise<void> {
  const stored = await area.get(KEYS.schemaVersion);
  const from = typeof stored[KEYS.schemaVersion] === 'number' ? (stored[KEYS.schemaVersion] as number) : 0;

  if (from === SCHEMA_VERSION) return;

  // v0 -> v1: first versioned schema. Nothing to transform; just stamp it.
  // Future migrations go here as `if (from < 2) { ... }` blocks, applied in order.

  await area.set({ [KEYS.schemaVersion]: SCHEMA_VERSION });
}
