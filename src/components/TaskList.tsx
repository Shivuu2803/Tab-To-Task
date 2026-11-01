import { useState } from 'react';
import { Task, statusOf } from '../lib/types';
import { displayUrl, isSafeFaviconUrl } from '../lib/url';
import { openTaskUrl } from '../lib/tab';
import { deleteTask, restoreTask, setCompleted, updateTask } from '../lib/tasks';
import { Button, Input, Textarea } from './ui';
import { useGuardedAction } from './Toast';

function Favicon({ task }: { task: Task }) {
  const [failed, setFailed] = useState(false);
  // Only ever render the extension's own favicon endpoint. Anything else would
  // make this <img> fetch a third-party URL every time the list renders.
  if (!isSafeFaviconUrl(task.faviconUrl) || failed) {
    return (
      <span className="grid size-4 shrink-0 place-items-center rounded bg-slate-200 text-[9px] font-semibold text-slate-500 dark:bg-slate-700 dark:text-slate-400">
        {displayUrl(task.url).charAt(0).toUpperCase() || '?'}
      </span>
    );
  }
  return (
    <img
      src={task.faviconUrl}
      alt=""
      className="size-4 shrink-0 rounded"
      onError={() => setFailed(true)}
    />
  );
}

interface TaskItemProps {
  task: Task;
  editable?: boolean;
}

export function TaskItem({ task, editable = false }: TaskItemProps) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [nextAction, setNextAction] = useState(task.nextAction);
  const [notes, setNotes] = useState(task.notes);
  const guard = useGuardedAction();

  const done = statusOf(task) === 'done';
  const trashed = task.deletedAt !== null;

  async function save() {
    const ok = await guard(
      () => updateTask(task.id, { title, nextAction, notes }),
      'Could not save your changes.',
    );
    // Stay in edit mode on failure so the typed text is not thrown away.
    if (ok) setEditing(false);
  }

  // Load the fields from the task as it is now, not as it was when this row
  // mounted — another window may have edited it since, and saving stale
  // values would quietly undo that edit.
  function startEditing() {
    setTitle(task.title);
    setNextAction(task.nextAction);
    setNotes(task.notes);
    setEditing(true);
  }

  if (editing) {
    return (
      <li className="space-y-2 border-b border-slate-200 p-3 dark:border-slate-800">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task" autoFocus />
        <Input
          value={nextAction}
          onChange={(e) => setNextAction(e.target.value)}
          placeholder="Next action"
        />
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes"
          rows={2}
        />
        <div className="flex justify-end gap-1">
          <Button onClick={() => setEditing(false)}>Cancel</Button>
          <Button variant="primary" onClick={() => void save()}>
            Save
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li className="group border-b border-slate-200 p-3 last:border-0 dark:border-slate-800">
      <div className="flex items-start gap-2.5">
        {!trashed && (
          <input
            type="checkbox"
            checked={done}
            onChange={(e) =>
              void guard(
                () => setCompleted(task.id, e.target.checked),
                'Could not update that task.',
              )
            }
            aria-label={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
            className="mt-0.5 size-4 shrink-0 cursor-pointer accent-brand-600"
          />
        )}

        <div className="min-w-0 flex-1">
          <p
            className={`text-sm leading-snug font-medium ${
              done
                ? 'text-slate-400 line-through dark:text-slate-600'
                : 'text-slate-900 dark:text-slate-100'
            }`}
          >
            {task.title}
          </p>

          {task.nextAction && (
            <p className="mt-0.5 text-xs leading-snug text-brand-700 dark:text-brand-100">
              → {task.nextAction}
            </p>
          )}

          {task.notes && (
            <p className="mt-1 text-xs leading-snug whitespace-pre-wrap text-slate-500 dark:text-slate-500">
              {task.notes}
            </p>
          )}

          <button
            onClick={() =>
              void guard(async () => {
                if (!(await openTaskUrl(task.url))) throw new Error('That link is no longer valid.');
              }, 'Could not open that page.')
            }
            title={task.url}
            className="mt-1 flex max-w-full items-center gap-1.5 text-left text-[11px] text-slate-500 hover:text-brand-600 hover:underline dark:text-slate-500 dark:hover:text-brand-100"
          >
            <Favicon task={task} />
            <span className="truncate">{displayUrl(task.url)}</span>
          </button>
        </div>

        <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
          {trashed ? (
            <Button
              onClick={() => void guard(() => restoreTask(task.id), 'Could not restore that task.')}
              className="px-2"
            >
              Restore
            </Button>
          ) : (
            <>
              {editable && (
                <Button onClick={startEditing} className="px-2" aria-label="Edit task">
                  Edit
                </Button>
              )}
              <Button
                variant="danger"
                onClick={() => void guard(() => deleteTask(task.id), 'Could not delete that task.')}
                className="px-2"
                aria-label="Delete task"
              >
                Delete
              </Button>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

export function TaskList({ tasks, editable }: { tasks: Task[]; editable?: boolean }) {
  return (
    <ul className="divide-y divide-slate-200 dark:divide-slate-800">
      {tasks.map((task) => (
        <TaskItem key={task.id} task={task} editable={editable} />
      ))}
    </ul>
  );
}
