/**
 * Core domain types.
 *
 * Storage shape note: tasks are stored as individual keys (`task:<id>`), never
 * as one array. Two extension contexts (popup + side panel) can write at the
 * same time, and a single `tasks` array would mean read-modify-write clobbering.
 * See lib/storage.ts.
 */

export const SCHEMA_VERSION = 1;

export interface Task {
  id: string;
  /** What the user wants to accomplish. Defaults to the page title. */
  title: string;
  /** The saved page. */
  url: string;
  pageTitle: string;
  faviconUrl: string | null;
  /** The concrete next step — the thing a bookmark can't remember for you. */
  nextAction: string;
  notes: string;
  createdAt: number;
  updatedAt: number;
  /** Status is derived from this, never stored separately. */
  completedAt: number | null;
  /** Soft delete. Trash is purged after TRASH_RETENTION_DAYS. */
  deletedAt: number | null;
}

export interface Settings {
  /** 'newest' | 'oldest' — kept minimal for v1. */
  sort: 'newest' | 'oldest';
  theme: 'system' | 'light' | 'dark';
}

export const DEFAULT_SETTINGS: Settings = {
  sort: 'newest',
  theme: 'system',
};

/** Unsaved popup form state, so a closing popup doesn't lose typing. */
export interface Draft {
  url: string;
  title: string;
  nextAction: string;
  notes: string;
  updatedAt: number;
}

export function statusOf(task: Task): 'pending' | 'done' {
  return task.completedAt === null ? 'pending' : 'done';
}
