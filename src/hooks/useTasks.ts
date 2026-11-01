import { useCallback, useEffect, useState } from 'react';
import { listTasks } from '../lib/tasks';
import { isTaskKey } from '../lib/storage';
import { Task } from '../lib/types';

export interface UseTasksResult {
  tasks: Task[];
  loading: boolean;
  /** Rarely needed — onChanged already keeps this current. */
  refresh: () => Promise<void>;
}

/**
 * Tasks live in chrome.storage, not in React state. Every context (popup, side
 * panel, options) subscribes to storage.onChanged and re-reads, so completing a
 * task in the side panel updates an open popup immediately and the two can
 * never disagree about what is saved.
 *
 * React state here is a cache of storage, never the authority.
 */
export function useTasks(options: { includeDeleted?: boolean } = {}): UseTasksResult {
  const includeDeleted = options.includeDeleted ?? false;
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setTasks(await listTasks({ includeDeleted }));
    setLoading(false);
  }, [includeDeleted]);

  useEffect(() => {
    let active = true;

    void (async () => {
      const next = await listTasks({ includeDeleted });
      if (active) {
        setTasks(next);
        setLoading(false);
      }
    })();

    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (areaName !== 'local') return;
      // Ignore churn from the draft and settings keys.
      if (!Object.keys(changes).some(isTaskKey)) return;
      void refresh();
    };

    chrome.storage.onChanged.addListener(onChanged);
    return () => {
      active = false;
      chrome.storage.onChanged.removeListener(onChanged);
    };
  }, [includeDeleted, refresh]);

  return { tasks, loading, refresh };
}
