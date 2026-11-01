import { getStorageArea, KEYS } from './storage';
import { Draft } from './types';

/**
 * The popup is destroyed the instant it loses focus — the user clicks the page,
 * alt-tabs, opens devtools, and anything half-typed is gone. Persisting the
 * form on every keystroke is the only way to survive that.
 *
 * A draft is scoped to its URL: reopening the popup on a different page starts
 * clean rather than resurrecting a stale draft for some other tab.
 */

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export async function loadDraft(url: string): Promise<Draft | null> {
  const stored = await getStorageArea().get(KEYS.draft);
  const value = stored[KEYS.draft] as Draft | undefined;
  if (!value || typeof value !== 'object') return null;
  if (value.url !== url) return null;
  if (Date.now() - value.updatedAt > STALE_AFTER_MS) return null;
  return value;
}

export async function saveDraft(draft: Omit<Draft, 'updatedAt'>): Promise<void> {
  const isEmpty = !draft.title.trim() && !draft.nextAction.trim() && !draft.notes.trim();
  if (isEmpty) return clearDraft();
  await getStorageArea().set({ [KEYS.draft]: { ...draft, updatedAt: Date.now() } });
}

export async function clearDraft(): Promise<void> {
  await getStorageArea().remove(KEYS.draft);
}
