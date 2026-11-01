import { useMemo, useState } from 'react';
import { useTasks } from '../../hooks/useTasks';
import { useSettings } from '../../hooks/useSettings';
import { pressPhrase, useShortcuts } from '../../hooks/useShortcuts';
import { countPending, tasksForView, TaskView } from '../../lib/tasks';
import { Button, EmptyState, Input } from '../../components/ui';
import { TaskList } from '../../components/TaskList';

const TABS: { id: TaskView; label: string }[] = [
  { id: 'pending', label: 'To do' },
  { id: 'done', label: 'Done' },
  { id: 'trash', label: 'Trash' },
];

export function SidePanel() {
  const [tab, setTab] = useState<TaskView>('pending');
  const [search, setSearch] = useState('');

  // Always load the trash too and filter per tab, so switching tabs never
  // shows rows from the previous one while a reload is in flight.
  const { tasks, loading } = useTasks({ includeDeleted: true });
  const { sort } = useSettings();
  const shortcuts = useShortcuts();

  const visible = useMemo(
    () => tasksForView(tasks, tab, { search, sort }),
    [tasks, tab, search, sort],
  );

  const pendingCount = countPending(tasks);

  return (
    <div className="flex h-screen flex-col bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="space-y-2 border-b border-slate-200 p-3 dark:border-slate-800">
        <div className="flex items-center justify-between">
          <h1 className="text-sm font-semibold">
            Tab-to-Task
            {pendingCount > 0 && (
              <span className="ml-1.5 text-xs font-normal text-slate-400">{pendingCount}</span>
            )}
          </h1>
          <Button
            onClick={() => void chrome.runtime.openOptionsPage()}
            className="px-2 text-xs"
            aria-label="Settings"
          >
            Settings
          </Button>
        </div>

        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tasks, actions, pages…"
        />

        <nav className="flex gap-1" role="tablist">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                tab === id
                  ? 'bg-brand-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? null : visible.length === 0 ? (
          <EmptyState
            title={search ? 'Nothing matches that search' : emptyTitle(tab)}
            body={search ? 'Try a different word.' : emptyBody(tab, shortcuts.save)}
          />
        ) : (
          <TaskList tasks={visible} editable />
        )}
      </div>
    </div>
  );
}

function emptyTitle(tab: TaskView): string {
  if (tab === 'done') return 'Nothing completed yet';
  if (tab === 'trash') return 'Trash is empty';
  return 'No tasks yet';
}

function emptyBody(tab: TaskView, saveShortcut: string): string {
  if (tab === 'done') return 'Completed tasks collect here so you can reopen them.';
  if (tab === 'trash') return 'Deleted tasks stay here for 30 days before being removed.';
  return `Open a page you care about and ${pressPhrase(saveShortcut, 'click the toolbar icon')} to save it with a next action.`;
}
