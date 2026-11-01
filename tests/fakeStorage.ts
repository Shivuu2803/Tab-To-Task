import { StorageArea } from '../src/lib/storage';

/**
 * In-memory stand-in for chrome.storage.local. Structured-clones on read and
 * write so tests cannot accidentally mutate "stored" objects by reference —
 * the real API serialises, and a fake that shares references hides bugs.
 */
export function createFakeStorage(initial: Record<string, unknown> = {}): StorageArea & {
  dump: () => Record<string, unknown>;
} {
  let data: Record<string, unknown> = structuredClone(initial);

  return {
    async get(keys) {
      if (keys === null || keys === undefined) return structuredClone(data);
      const list = Array.isArray(keys) ? keys : [keys];
      const out: Record<string, unknown> = {};
      for (const key of list) {
        if (key in data) out[key] = structuredClone(data[key]);
      }
      return out;
    },
    async set(items) {
      data = { ...data, ...structuredClone(items) };
    },
    async remove(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key];
    },
    async clear() {
      data = {};
    },
    dump: () => structuredClone(data),
  };
}
